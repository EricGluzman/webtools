"""End to end: synthetic frames in, keystrokes out.

Wires the real detector, tracker, keeper and input controller together behind a
fake screen, so the whole chain is exercised without a display or a game.
"""

import threading
import time
import unittest

try:
    import cv2
    import numpy as np
    HAVE_CV = True
except ImportError:  # pragma: no cover
    HAVE_CV = False

from pilot.core.config import Config
from pilot.core.capture import Grab
from pilot.core.inputs import DryBackend


class FakeScreen:
    """Stands in for mss: replays a scripted ball approaching the goal."""

    def __init__(self, frames):
        self.frames = frames
        self.index = 0
        self.grabs = 0

    def configure(self, _settings):
        pass

    def close(self):
        pass

    def grab(self):
        self.grabs += 1
        frame = self.frames[min(self.index, len(self.frames) - 1)]
        self.index += 1
        return Grab(frame, 1.0, (0, 0))


def approaching_shot(steps=14):
    """Frames of a ball swelling and dropping towards the keeper's right."""
    frames = []
    for i in range(steps):
        frame = np.full((360, 640, 3), (120, 170, 205), np.uint8)
        cv2.rectangle(frame, (0, 0), (640, 34), (90, 130, 160), -1)
        x = 330 + i * 12
        y = 120 + i * 16
        radius = 6 + i * 3
        cv2.circle(frame, (x, y), radius, (245, 245, 245), -1)
        frames.append(frame)
    return frames


@unittest.skipUnless(HAVE_CV, "opencv/numpy not installed")
class TestLoopIntegration(unittest.TestCase):
    def _build(self, frames):
        from pilot.core.loop import BotLoop
        from pilot.games.illegal_soccer.goalkeeper import Goalkeeper
        from pilot.vision.ball import BallDetector

        config = Config()
        config.set("window.require_focus", False)   # no game window in a test
        config.set("capture.target_fps", 60)
        config.set("input.backend", "dry")

        brain = Goalkeeper(config.section("games.illegal_soccer.goalkeeper"))
        detector = BallDetector(config.section("games.illegal_soccer.vision"))

        self.logs = []
        loop = BotLoop(config, "illegal_soccer", brain, detector,
                       on_log=self.logs.append)
        loop.capture = FakeScreen(frames)
        self.backend = DryBackend()
        loop.controller.backend = self.backend
        return loop

    def _run_briefly(self, loop, seconds=0.7):
        loop.start()
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline and loop.running:
            time.sleep(0.02)
        loop.stop()

    def test_a_shot_makes_the_keeper_commit(self):
        loop = self._build(approaching_shot())
        self._run_briefly(loop)

        names = [name for _kind, name in
                 [(e[0], e[1]) for e in self.backend.events]]
        self.assertTrue(
            any(n in ("mouse_right", "mouse_left") for n in names),
            "keeper never dived or punched at an incoming shot: %s"
            % self.backend.events[:12])

    def test_everything_is_released_once_it_stops(self):
        loop = self._build(approaching_shot())
        self._run_briefly(loop)

        # Tally presses against releases: nothing may be left held down.
        down, up = {}, {}
        for kind, value in self.backend.events:
            if kind in ("key_down", "mouse_down"):
                down[value] = down.get(value, 0) + 1
            elif kind in ("key_up", "mouse_up"):
                up[value] = up.get(value, 0) + 1
        for key, count in down.items():
            self.assertEqual(up.get(key, 0), count,
                             "%r was pressed %d times but released %d"
                             % (key, count, up.get(key, 0)))
        self.assertEqual(loop.controller.held, set())

    def test_it_reports_what_it_is_doing(self):
        loop = self._build(approaching_shot())
        self._run_briefly(loop)
        self.assertGreater(loop.capture.grabs, 3)
        self.assertFalse(loop.telemetry.running)
        self.assertIn("Bot started", self.logs)

    def test_pausing_lets_go_of_the_keyboard(self):
        loop = self._build(approaching_shot())
        loop.start()
        time.sleep(0.15)
        loop.toggle_pause()
        time.sleep(0.1)
        self.assertEqual(loop.controller.held, set())
        self.assertTrue(loop.paused)
        loop.stop()

    def test_an_empty_pitch_sends_nothing(self):
        blank = [np.full((360, 640, 3), (120, 170, 205), np.uint8)
                 for _ in range(6)]
        loop = self._build(blank)
        self._run_briefly(loop, 0.4)
        presses = [e for e in self.backend.events
                   if e[0] in ("key_down", "mouse_down")]
        self.assertEqual(presses, [])

    def test_stopping_twice_is_harmless(self):
        loop = self._build(approaching_shot())
        self._run_briefly(loop, 0.3)
        loop.stop()
        self.assertFalse(loop.running)

    def test_the_loop_thread_does_not_outlive_stop(self):
        loop = self._build(approaching_shot())
        self._run_briefly(loop, 0.3)
        names = [t.name for t in threading.enumerate()]
        self.assertNotIn("pilot-loop", names)


if __name__ == "__main__":
    unittest.main()
