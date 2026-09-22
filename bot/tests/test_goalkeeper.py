"""Keeper behaviour: the decisions, not the pixels.

Each test poses a situation the keeper meets in a match and asserts the thing a
coach would shout.
"""

import unittest

from pilot.core.config import DEFAULTS
from pilot.core.geometry import Frame
from pilot.core.tracker import BallState
from pilot.games.illegal_soccer import goalkeeper as gk

TUNING = DEFAULTS["games"]["illegal_soccer"]["goalkeeper"]
FRAME = Frame(640, 360)


def ball(x, y, radius=8.0, vx=0.0, vy=0.0, growth=0.0, visible=True):
    """A BallState positioned in pixels of a 640x360 analysed frame."""
    return BallState(position=(x, y), velocity=(vx, vy), radius=radius,
                     growth=growth, confidence=1.0 if visible else 0.0,
                     age=0.0 if visible else 99.0, samples=8)


def keeper():
    return gk.Goalkeeper(dict(TUNING))


class TestHoldingTheLine(unittest.TestCase):
    def test_shadows_a_ball_out_to_the_left(self):
        action = keeper().decide(ball(120, 150, radius=6), 1.0, FRAME)
        self.assertEqual(action.state, gk.HOLD_LINE)
        self.assertIn("left", action.hold)
        self.assertNotIn("right", action.hold)

    def test_shadows_a_ball_out_to_the_right(self):
        action = keeper().decide(ball(520, 150, radius=6), 1.0, FRAME)
        self.assertEqual(action.state, gk.HOLD_LINE)
        self.assertIn("right", action.hold)

    def test_stands_still_when_the_ball_is_straight_ahead(self):
        action = keeper().decide(ball(320, 150, radius=6), 1.0, FRAME)
        self.assertNotIn("left", action.hold)
        self.assertNotIn("right", action.hold)

    def test_turns_the_camera_towards_the_ball(self):
        left = keeper().decide(ball(80, 150, radius=6), 1.0, FRAME)
        right = keeper().decide(ball(560, 150, radius=6), 1.0, FRAME)
        self.assertLess(left.camera[0], 0)
        self.assertGreater(right.camera[0], 0)

    def test_never_chases_beyond_the_posts(self):
        # Ball miles out wide; the keeper must not abandon the near post.
        brain = keeper()
        action = brain.decide(ball(639, 150, radius=6), 1.0, FRAME)
        self.assertIn("holding the line at", action.note)
        target = float(action.note.rsplit(" ", 1)[1])
        self.assertLessEqual(target, TUNING["post_right"] + 1e-6)


class TestSaving(unittest.TestCase):
    def test_dives_right_at_a_shot_to_that_corner(self):
        action = keeper().decide(
            ball(430, 250, radius=30, vx=300, vy=700, growth=120), 2.0, FRAME)
        self.assertEqual(action.state, gk.DIVE)
        self.assertIn("dive", action.tap)
        self.assertIn("right", action.hold)

    def test_dives_left_at_a_shot_to_that_corner(self):
        action = keeper().decide(
            ball(210, 250, radius=30, vx=-300, vy=700, growth=120), 2.0, FRAME)
        self.assertEqual(action.state, gk.DIVE)
        self.assertIn("left", action.hold)

    def test_punches_a_shot_hit_straight_at_it(self):
        action = keeper().decide(
            ball(320, 250, radius=30, vx=0, vy=700, growth=120), 2.0, FRAME)
        self.assertEqual(action.state, gk.PUNCH)
        self.assertIn("punch", action.tap)
        self.assertNotIn("dive", action.tap)

    def test_a_flat_drive_still_counts_as_a_shot(self):
        # Little growth, but crossing the screen fast.
        action = keeper().decide(
            ball(430, 250, radius=20, vx=420, vy=500, growth=5), 1.0, FRAME)
        self.assertIn(action.state, (gk.DIVE, gk.PUNCH))

    def test_a_ball_rolling_away_is_not_a_shot(self):
        action = keeper().decide(
            ball(320, 250, radius=20, vx=0, vy=-600, growth=-30), 1.0, FRAME)
        self.assertNotIn(action.state, (gk.DIVE, gk.PUNCH))

    def test_a_distant_ball_is_not_a_shot(self):
        action = keeper().decide(
            ball(320, 90, radius=5, vx=0, vy=60, growth=2), 1.0, FRAME)
        self.assertEqual(action.state, gk.HOLD_LINE)


class TestCommitmentAndCooldown(unittest.TestCase):
    def test_a_dive_is_not_interrupted_mid_air(self):
        brain = keeper()
        shot = ball(430, 250, radius=30, vx=300, vy=700, growth=120)
        first = brain.decide(shot, 2.0, FRAME)
        self.assertEqual(first.state, gk.DIVE)
        # A frame later the keeper is still committed, not re-deciding.
        during = brain.decide(ball(120, 150, radius=6), 2.05, FRAME)
        self.assertEqual(during.state, gk.DIVE)
        self.assertEqual(during.note, "committed")

    def test_will_not_dive_twice_in_a_heartbeat(self):
        brain = keeper()
        shot = ball(430, 250, radius=30, vx=300, vy=700, growth=120)
        brain.decide(shot, 2.0, FRAME)
        again = brain.decide(shot, 2.5, FRAME)
        self.assertNotEqual(again.state, gk.DIVE)
        self.assertNotIn("dive", again.tap)

    def test_can_dive_again_once_the_cooldown_passes(self):
        brain = keeper()
        shot = ball(430, 250, radius=30, vx=300, vy=700, growth=120)
        brain.decide(shot, 2.0, FRAME)
        later = brain.decide(shot, 2.0 + TUNING["dive_cooldown"] + 1.0, FRAME)
        self.assertEqual(later.state, gk.DIVE)

    def test_recovers_after_a_save_before_playing_on(self):
        brain = keeper()
        brain.decide(ball(320, 250, radius=30, vx=0, vy=700, growth=120), 2.0, FRAME)
        after = brain.decide(ball(120, 150, radius=6), 2.4, FRAME)
        self.assertEqual(after.state, gk.RECOVER)


class TestLooseBalls(unittest.TestCase):
    def test_comes_out_to_claim_a_loose_ball(self):
        action = keeper().decide(
            ball(330, 300, radius=50, vx=5, vy=20, growth=3), 1.0, FRAME)
        self.assertEqual(action.state, gk.CLAIM)
        self.assertIn("forward", action.hold)
        self.assertIn("sprint", action.hold)
        self.assertIn("punch", action.tap)

    def test_stays_set_when_the_ball_is_in_the_box_but_dead(self):
        action = keeper().decide(
            ball(300, 220, radius=30, vx=10, vy=5, growth=1), 1.0, FRAME)
        self.assertEqual(action.state, gk.SET)
        self.assertEqual(action.tap, [])


class TestWithoutTheBall(unittest.TestCase):
    def test_waits_quietly_before_it_has_ever_seen_the_ball(self):
        action = keeper().decide(ball(0, 0, visible=False), 1.0, FRAME)
        self.assertEqual(action.state, gk.IDLE)
        self.assertEqual(action.hold, set())
        self.assertEqual(action.tap, [])

    def test_sweeps_for_a_ball_it_has_lost(self):
        brain = keeper()
        brain.decide(ball(320, 150, radius=6), 1.0, FRAME)
        action = brain.decide(ball(0, 0, visible=False), 2.0, FRAME)
        self.assertEqual(action.state, gk.SEARCH)
        self.assertNotEqual(action.camera[0], 0.0)

    def test_the_sweep_changes_direction_rather_than_spinning(self):
        brain = keeper()
        brain.decide(ball(320, 150, radius=6), 1.0, FRAME)
        first = brain.decide(ball(0, 0, visible=False), 2.0, FRAME)
        later = brain.decide(ball(0, 0, visible=False), 4.0, FRAME)
        self.assertNotEqual(first.camera[0] > 0, later.camera[0] > 0)


class TestDistribution(unittest.TestCase):
    def _hold(self, brain, start, until):
        held = ball(320, 200, radius=70, vx=2, vy=1, growth=0)
        action = None
        moment = start
        while moment <= until:
            action = brain.decide(held, moment, FRAME)
            moment += 0.1
        return action

    def test_clears_the_ball_once_it_has_held_it(self):
        brain = keeper()
        action = self._hold(brain, 1.0, 1.0 + TUNING["distribute_delay"] + 0.3)
        self.assertEqual(action.state, gk.DISTRIBUTE)

    def test_does_not_clear_instantly(self):
        brain = keeper()
        action = brain.decide(
            ball(320, 200, radius=70, vx=2, vy=1, growth=0), 1.0, FRAME)
        self.assertEqual(action.state, gk.DISTRIBUTE)
        self.assertEqual(action.tap, [])

    def test_lob_is_the_default_clearance(self):
        brain = keeper()
        taps = []
        moment = 1.0
        while moment <= 3.0:
            taps.extend(brain.decide(
                ball(320, 200, radius=70, vx=2, vy=1, growth=0),
                moment, FRAME).tap)
            moment += 0.1
        self.assertIn("lob", taps)

    def test_request_mode_calls_for_it_instead(self):
        tuning = dict(TUNING)
        tuning["distribute_with"] = "request"
        brain = gk.Goalkeeper(tuning)
        taps = []
        moment = 1.0
        while moment <= 3.0:
            taps.extend(brain.decide(
                ball(320, 200, radius=70, vx=2, vy=1, growth=0),
                moment, FRAME).tap)
            moment += 0.1
        self.assertIn("request", taps)
        self.assertNotIn("lob", taps)


class TestResolutionIndependence(unittest.TestCase):
    def test_the_same_situation_decides_the_same_at_1080p(self):
        small = keeper().decide(
            ball(430, 250, radius=30, vx=300, vy=700, growth=120), 2.0,
            Frame(640, 360))
        # Same scene, three times the frame: positions and speeds scale too.
        big = keeper().decide(
            ball(1290, 750, radius=90, vx=900, vy=2100, growth=360), 2.0,
            Frame(1920, 1080))
        self.assertEqual(small.state, big.state)
        self.assertEqual(small.hold, big.hold)


class TestReset(unittest.TestCase):
    def test_reset_clears_the_cooldowns(self):
        brain = keeper()
        shot = ball(430, 250, radius=30, vx=300, vy=700, growth=120)
        brain.decide(shot, 2.0, FRAME)
        brain.reset()
        self.assertEqual(brain.state, gk.IDLE)
        again = brain.decide(shot, 2.1, FRAME)
        self.assertEqual(again.state, gk.DIVE)


if __name__ == "__main__":
    unittest.main()
