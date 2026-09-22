"""Geometry: the maths the keeper's decisions rest on."""

import unittest

from pilot.core.geometry import (Frame, clamp, goal_line_anchor,
                                 intersect_x_at_y, linear_fit, normalise,
                                 predict, sign, time_to_radius, time_to_y)


class TestBasics(unittest.TestCase):
    def test_clamp_orders_reversed_bounds(self):
        self.assertEqual(clamp(5, 10, 0), 5)
        self.assertEqual(clamp(-3, 0, 10), 0)
        self.assertEqual(clamp(30, 0, 10), 10)

    def test_sign_respects_deadzone(self):
        self.assertEqual(sign(0.02, 0.05), 0)
        self.assertEqual(sign(0.2, 0.05), 1)
        self.assertEqual(sign(-0.2, 0.05), -1)

    def test_normalise_leaves_zeros_alone(self):
        self.assertEqual(normalise([0.0, 0.0]), (0.0, 0.0))
        self.assertEqual(normalise([2.0, -4.0]), (0.5, -1.0))


class TestLinearFit(unittest.TestCase):
    def test_exact_line(self):
        slope, intercept = linear_fit([(0, 1), (1, 3), (2, 5)])
        self.assertAlmostEqual(slope, 2.0)
        self.assertAlmostEqual(intercept, 1.0)

    def test_noise_does_not_swing_the_slope(self):
        clean = linear_fit([(i * 0.1, i * 10.0) for i in range(8)])[0]
        noisy = [(i * 0.1, i * 10.0 + (1.5 if i % 2 else -1.5)) for i in range(8)]
        self.assertAlmostEqual(clean, linear_fit(noisy)[0], delta=6.0)

    def test_degenerate_inputs(self):
        self.assertEqual(linear_fit([]), (0.0, 0.0))
        self.assertEqual(linear_fit([(3.0, 7.0)]), (0.0, 7.0))
        # All samples at the same instant: no slope can be inferred.
        self.assertEqual(linear_fit([(1.0, 5.0), (1.0, 9.0)])[0], 0.0)


class TestTrajectory(unittest.TestCase):
    def test_predict(self):
        self.assertEqual(predict((0, 0), (10, -5), 2.0), (20.0, -10.0))

    def test_crossing_a_line_ahead(self):
        self.assertAlmostEqual(intersect_x_at_y((0, 0), (10, 20), 100), 50.0)

    def test_ball_moving_away_never_crosses(self):
        self.assertIsNone(intersect_x_at_y((0, 200), (10, -20), 400))

    def test_parallel_motion_never_crosses(self):
        self.assertIsNone(intersect_x_at_y((0, 0), (10, 0), 100))
        self.assertIsNone(time_to_y((0, 0), (10, 0), 100))

    def test_time_to_line(self):
        self.assertAlmostEqual(time_to_y((0, 0), (0, 50), 100), 2.0)


class TestApproach(unittest.TestCase):
    def test_growing_ball_arrives(self):
        self.assertAlmostEqual(time_to_radius(10.0, 20.0, 50.0), 2.0)

    def test_already_there(self):
        self.assertEqual(time_to_radius(60.0, 20.0, 50.0), 0.0)

    def test_shrinking_ball_never_arrives(self):
        self.assertIsNone(time_to_radius(10.0, -5.0, 50.0))
        self.assertIsNone(time_to_radius(10.0, 0.0, 50.0))


class TestGoalLineAnchor(unittest.TestCase):
    def test_keeper_leans_towards_the_ball(self):
        anchor = goal_line_anchor((300, 100), (100, 400), (500, 400), depth=0.5)
        self.assertGreater(anchor[0], 299.0)
        self.assertLess(anchor[1], 400.0)

    def test_never_strays_outside_the_posts(self):
        # Ball out wide: the keeper still must not leave the near post.
        anchor = goal_line_anchor((2000, 100), (100, 400), (500, 400), depth=0.9)
        self.assertLessEqual(anchor[0], 500.0)
        self.assertGreaterEqual(anchor[0], 100.0)

    def test_zero_depth_stays_on_the_line(self):
        anchor = goal_line_anchor((300, 50), (100, 400), (500, 400), depth=0.0)
        self.assertAlmostEqual(anchor[1], 400.0)


class TestFrame(unittest.TestCase):
    def test_normalises_pixels(self):
        frame = Frame(640, 360)
        self.assertEqual(frame.norm(320, 180), (0.5, 0.5))

    def test_diagonal(self):
        self.assertAlmostEqual(Frame(3, 4).diagonal, 5.0)


if __name__ == "__main__":
    unittest.main()
