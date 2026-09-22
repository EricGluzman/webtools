"""The bot runtime: perceive, decide, act — on a thread, at a fixed rate.

The loop owns the only place where the three halves of the pilot meet: the
screen goes in, a brain decides, and keys come out.  It also owns every reason
to *not* send input (game not focused, operator paused, panic key pressed) so
those checks exist in exactly one place.
"""

from __future__ import annotations

import threading
import time
import traceback
from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol

from .action import Action
from .capture import CaptureError, Grab, ScreenCapture
from .config import Config
from .geometry import Frame
from .inputs import InputController, make_backend
from .system import HotkeyWatcher, window_is_focused
from .tracker import BallState, BallTracker, Sighting


class Brain(Protocol):
    """What the loop needs from a game brain."""

    state: str

    def decide(self, ball: BallState, now: float, frame: Any) -> Action: ...
    def reset(self) -> None: ...


@dataclass
class Telemetry:
    """A snapshot of the last tick, for the panel to draw."""

    running: bool = False
    paused: bool = False
    focused: bool = True
    state: str = "idle"
    note: str = ""
    action: str = ""
    fps: float = 0.0
    ball_visible: bool = False
    ball_x: float = 0.0
    ball_y: float = 0.0
    ball_radius: float = 0.0
    ball_speed: float = 0.0
    ball_growth: float = 0.0
    frame_size: tuple = (0, 0)
    saves: int = 0
    backend: str = "none"
    error: str = ""


@dataclass
class _Counters:
    dives: int = 0
    punches: int = 0
    claims: int = 0


class BotLoop:
    """Runs a brain against the screen until told to stop."""

    def __init__(self, config: Config, game_key: str, brain: Brain,
                 detector: Any, on_telemetry: Optional[Callable[[Telemetry], None]] = None,
                 on_frame: Optional[Callable[[Grab, BallState], None]] = None,
                 on_log: Optional[Callable[[str], None]] = None) -> None:
        self.config = config
        self.game_key = game_key
        self.brain = brain
        self.detector = detector
        self.on_telemetry = on_telemetry
        self.on_frame = on_frame
        self.on_log = on_log

        self.capture = ScreenCapture(config.section("capture"))
        self.tracker = BallTracker()
        self.controller = InputController(
            config.section("games.%s.keys" % game_key),
            make_backend(str(config.get("input.backend", "auto"))))
        self.hotkeys = HotkeyWatcher()

        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._paused = threading.Event()
        self._lock = threading.Lock()
        self.telemetry = Telemetry(backend=self.controller.backend.name)
        self.counters = _Counters()
        self._last_frame: Optional[Grab] = None
        self._last_ball: Optional[BallState] = None

    # ----------------------------------------------------------------- state

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def paused(self) -> bool:
        return self._paused.is_set()

    def log(self, message: str) -> None:
        if self.on_log:
            try:
                self.on_log(message)
            except Exception:
                pass

    def snapshot(self):
        """The most recent frame and ball, for the preview widget."""
        with self._lock:
            return self._last_frame, self._last_ball

    # --------------------------------------------------------------- control

    def start(self) -> None:
        if self.running:
            return
        self._stop.clear()
        self._paused.clear()
        self.brain.reset()
        self.tracker.reset()
        self.counters = _Counters()
        self._thread = threading.Thread(target=self._run, name="pilot-loop",
                                        daemon=True)
        self._thread.start()
        self.log("Bot started")

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread and thread.is_alive() and thread is not threading.current_thread():
            thread.join(timeout=2.0)
        self._thread = None
        self.controller.release_all()
        self.telemetry.running = False
        self._emit()
        self.log("Bot stopped, all keys released")

    def toggle_pause(self) -> None:
        if self._paused.is_set():
            self._paused.clear()
            self.log("Resumed")
        else:
            self._paused.set()
            self.controller.release_all()
            self.log("Paused")
        self.telemetry.paused = self._paused.is_set()
        self._emit()

    def panic(self) -> None:
        """Hard stop from the panic hotkey: drop every key immediately."""
        self.controller.release_all()
        self._stop.set()
        self.log("Panic stop")

    # ------------------------------------------------------------------ loop

    def _emit(self) -> None:
        if self.on_telemetry:
            try:
                self.on_telemetry(self.telemetry)
            except Exception:
                pass

    def _install_hotkeys(self) -> None:
        self.hotkeys.clear()
        self.hotkeys.start_listener()
        toggle = str(self.config.get("hotkeys.toggle", "f8"))
        stop_key = str(self.config.get("hotkeys.stop", "f9"))
        self.hotkeys.bind(toggle, self.toggle_pause)
        self.hotkeys.bind(stop_key, self.panic)

    def _count(self, action: Action) -> None:
        if "dive" in action.tap:
            self.counters.dives += 1
        if "punch" in action.tap:
            self.counters.punches += 1

    def _run(self) -> None:
        self._install_hotkeys()
        target_fps = max(5.0, float(self.config.get("capture.target_fps", 30) or 30))
        frame_budget = 1.0 / target_fps
        title_fragment = str(self.config.get("window.title_contains", "Roblox"))
        require_focus = bool(self.config.get("window.require_focus", True))
        camera_enabled = bool(self.config.get("input.camera_enabled", True))
        camera_gain = float(self.config.get("input.camera_gain", 2.6) or 2.6)
        camera_max = int(self.config.get("input.camera_max_step", 45) or 45)
        max_minutes = float(self.config.get("safety.max_run_minutes", 0) or 0)

        started = time.monotonic()
        smoothed_fps = 0.0
        last_tick = 0.0
        frame_info: Optional[Frame] = None
        self.telemetry.running = True
        self.telemetry.backend = self.controller.backend.name
        self.telemetry.error = ""
        self._emit()

        try:
            while not self._stop.is_set():
                tick_started = time.monotonic()
                self.hotkeys.poll()

                if max_minutes > 0 and (tick_started - started) > max_minutes * 60:
                    self.log("Run time limit reached")
                    break

                focused = (not require_focus) or window_is_focused(title_fragment)
                self.telemetry.focused = focused
                self.telemetry.paused = self._paused.is_set()

                # Anything that means "do not touch the keyboard" lands here,
                # and every one of them releases what is currently held.
                if self._paused.is_set() or not focused:
                    self.controller.release_all()
                    self.telemetry.state = "paused" if self._paused.is_set() \
                        else "waiting for game window"
                    self.telemetry.note = ("hotkey pause" if self._paused.is_set()
                                           else "focus %r to resume" % title_fragment)
                    self.telemetry.action = ""
                    self._emit()
                    time.sleep(max(frame_budget, 0.08))
                    continue

                try:
                    grab = self.capture.grab()
                except CaptureError as exc:
                    self.telemetry.error = str(exc)
                    self.log("Capture failed: %s" % exc)
                    break
                except Exception as exc:  # pragma: no cover - driver issues
                    self.telemetry.error = "capture: %s" % exc
                    self.log("Capture error: %s" % exc)
                    time.sleep(0.25)
                    continue

                width, height = grab.size
                self.tracker.set_frame_size(width, height)

                hint = None
                if self._last_ball is not None and self._last_ball.visible:
                    hint = self._last_ball.position

                now = time.monotonic()
                detection = self.detector.detect(grab.image, hint)
                sighting = None
                if detection is not None:
                    sighting = Sighting(now, detection.x, detection.y,
                                        detection.radius,
                                        min(1.0, max(0.05, detection.score)))
                ball = self.tracker.update(sighting, now)

                if frame_info is None or frame_info.width != width \
                        or frame_info.height != height:
                    frame_info = Frame(width, height)
                try:
                    action = self.brain.decide(ball, now, frame_info)
                except Exception as exc:  # pragma: no cover - brain bugs
                    self.telemetry.error = "brain: %s" % exc
                    self.log("Brain error: %s\n%s" % (exc, traceback.format_exc()))
                    self.controller.release_all()
                    break

                self.controller.apply_hold(action.hold)
                for name in action.tap:
                    self.controller.tap(name)
                self.controller.pump(now)
                self._count(action)

                if camera_enabled and (action.camera[0] or action.camera[1]):
                    self.controller.look(action.camera[0] * camera_gain * 0.02,
                                         action.camera[1] * camera_gain * 0.02,
                                         camera_max)

                with self._lock:
                    self._last_frame = grab
                    self._last_ball = ball
                if self.on_frame:
                    try:
                        self.on_frame(grab, ball)
                    except Exception:
                        pass

                # Measure tick to tick, not just the work: the frame-budget
                # sleep below is part of the rate the operator actually sees.
                if last_tick > 0.0:
                    instant_fps = 1.0 / max(1e-3, tick_started - last_tick)
                    smoothed_fps = instant_fps if smoothed_fps == 0 else \
                        smoothed_fps * 0.85 + instant_fps * 0.15
                last_tick = tick_started

                self.telemetry.state = action.state
                self.telemetry.note = action.note
                self.telemetry.action = action.describe()
                self.telemetry.fps = smoothed_fps
                self.telemetry.ball_visible = ball.visible
                self.telemetry.ball_x, self.telemetry.ball_y = ball.position
                self.telemetry.ball_radius = ball.radius
                self.telemetry.ball_speed = ball.speed
                self.telemetry.ball_growth = ball.growth
                self.telemetry.frame_size = (width, height)
                self.telemetry.saves = self.counters.dives + self.counters.punches
                self._emit()

                remaining = frame_budget - (time.monotonic() - tick_started)
                if remaining > 0:
                    time.sleep(remaining)
        finally:
            self.controller.release_all()
            self.hotkeys.stop_listener()
            self.capture.close()
            self.telemetry.running = False
            self.telemetry.state = "stopped"
            self._emit()
