"""Tracking: turning jittery sightings into usable motion."""

import unittest

from pilot.core.tracker import BallTracker, Sighting


def feed(tracker, points, start=0.0, step=1 / 30.0):
    """Push a list of (x, y, r) through the tracker and return the last state."""
    state = None
    for index, (x, y, radius) in enumerate(points):
        now = start + index * step
        state = tracker.update(Sighting(now, x, y, radius), now)
    return state


class TestVelocity(unittest.TestCase):
    def setUp(self):
        self.tracker = BallTracker()
        self.tracker.set_frame_size(640, 360)

    def test_straight_line_gives_the_right_direction(self):
        state = feed(self.tracker, [(100 + i * 12, 200, 8) for i in range(10)])
        self.assertGreater(state.velocity[0], 0)
        self.assertAlmostEqual(state.velocity[1], 0.0, delta=12.0)
        self.assertTrue(state.visible)

    def test_growth_tracks_an_approaching_ball(self):
        state = feed(self.tracker, [(320, 100 + i * 15, 6 + i * 2)
                                    for i in range(10)])
        self.assertGreater(state.growth, 20.0)
        self.assertGreater(state.velocity[1], 0)

    def test_speed_is_the_magnitude(self):
        state = feed(self.tracker, [(100 + i * 9, 100 + i * 12, 8)
                                    for i in range(10)])
        self.assertGreater(state.speed, 0)
        self.assertAlmostEqual(
            state.speed,
            (state.velocity[0] ** 2 + state.velocity[1] ** 2) ** 0.5, places=5)


class TestRobustness(unittest.TestCase):
    def setUp(self):
        self.tracker = BallTracker()
        self.tracker.set_frame_size(640, 360)

    def test_coasts_through_a_dropped_frame(self):
        feed(self.tracker, [(100 + i * 12, 200, 8) for i in range(8)])
        state = self.tracker.update(None, 8 / 30.0)
        self.assertTrue(state.visible)
        self.assertGreater(state.position[0], 100)

    def test_gives_up_after_a_long_blackout(self):
        feed(self.tracker, [(100 + i * 12, 200, 8) for i in range(8)])
        state = self.tracker.update(None, 5.0)
        self.assertFalse(state.visible)
        self.assertEqual(state.samples, 0)

    def test_rejects_a_jump_across_the_pitch(self):
        feed(self.tracker, [(100 + i * 5, 200, 8) for i in range(8)])
        before = self.tracker.update(None, 8 / 30.0).position
        # A white shirt on the far side: too far to be the same ball.
        after = self.tracker.update(Sighting(9 / 30.0, 630, 40, 8), 9 / 30.0)
        self.assertLess(abs(after.position[0] - before[0]), 120)

    def test_accepts_a_jump_after_a_long_gap(self):
        feed(self.tracker, [(100 + i * 5, 200, 8) for i in range(8)])
        self.tracker.update(None, 1.0)
        state = self.tracker.update(Sighting(1.2, 600, 60, 9), 1.2)
        self.assertAlmostEqual(state.position[0], 600, delta=40)

    def test_empty_tracker_reports_nothing(self):
        state = self.tracker.update(None, 0.0)
        self.assertFalse(state.visible)
        self.assertEqual(state.confidence, 0.0)

    def test_confidence_decays_while_unseen(self):
        feed(self.tracker, [(100 + i * 12, 200, 8) for i in range(8)])
        fresh = self.tracker.update(None, 8 / 30.0).confidence
        stale = self.tracker.update(None, 8 / 30.0 + 0.3).confidence
        self.assertLess(stale, fresh)


class TestPrediction(unittest.TestCase):
    def test_predicts_where_it_will_cross_the_line(self):
        tracker = BallTracker()
        tracker.set_frame_size(640, 360)
        state = feed(tracker, [(200 + i * 10, 100 + i * 20, 8) for i in range(10)])
        crossing = state.crossing_x(320)
        self.assertIsNotNone(crossing)
        self.assertGreater(crossing, state.position[0])

    def test_no_crossing_when_it_is_going_the_other_way(self):
        tracker = BallTracker()
        tracker.set_frame_size(640, 360)
        state = feed(tracker, [(200, 300 - i * 20, 8) for i in range(10)])
        self.assertIsNone(state.crossing_x(350))


if __name__ == "__main__":
    unittest.main()
