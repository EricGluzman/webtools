"""Ball detection, against frames built to look like the pitch.

Skipped wholesale when OpenCV is not installed, so the rest of the suite still
runs on a machine that only has the standard library.
"""

import unittest

try:
    import cv2
    import numpy as np
    from pilot.vision.ball import BallDetector
    HAVE_CV = True
except ImportError:  # pragma: no cover
    HAVE_CV = False

from pilot.core.config import DEFAULTS

PITCH = (120, 170, 205)   # BGR, the sandy tone of the map
BALL = (245, 245, 245)


def pitch_frame(ball_xy=None, radius=8, decoys=True):
    """A frame that looks roughly like the game: sand, lines, kits, a ball."""
    frame = np.full((360, 640, 3), PITCH, np.uint8)
    cv2.rectangle(frame, (0, 0), (640, 34), (90, 130, 160), -1)   # scoreboard band
    if decoys:
        cv2.line(frame, (40, 300), (600, 300), (235, 235, 235), 3)   # paint
        cv2.rectangle(frame, (400, 120), (438, 205), (240, 240, 240), -1)  # kit
    if ball_xy is not None:
        cv2.circle(frame, ball_xy, radius, BALL, -1)
    return frame


@unittest.skipUnless(HAVE_CV, "opencv/numpy not installed")
class TestDetection(unittest.TestCase):
    def setUp(self):
        self.detector = BallDetector(
            DEFAULTS["games"]["illegal_soccer"]["vision"])

    def test_finds_the_ball(self):
        found = self.detector.detect(pitch_frame((240, 200), 9))
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found.x, 240, delta=4)
        self.assertAlmostEqual(found.y, 200, delta=4)
        self.assertAlmostEqual(found.radius, 9, delta=3)

    def test_empty_pitch_finds_nothing_round(self):
        self.assertIsNone(self.detector.detect(pitch_frame(None)))

    def test_prefers_the_round_thing_over_the_square_one(self):
        # The kit is brighter and bigger; only the ball is circular.
        found = self.detector.detect(pitch_frame((200, 180), 9))
        self.assertIsNotNone(found)
        self.assertLess(found.x, 350)

    def test_movement_lifts_the_score(self):
        self.detector.detect(pitch_frame((200, 180), 9))
        moving = self.detector.detect(pitch_frame((260, 205), 9))
        self.assertTrue(moving.moved)

    def test_a_hint_pulls_the_choice_towards_last_frame(self):
        frame = pitch_frame((150, 150), 8)
        cv2.circle(frame, (520, 260), 8, BALL, -1)     # a second candidate
        near = self.detector.detect(frame, hint=(150, 150))
        far = self.detector.detect(frame, hint=(520, 260))
        self.assertLess(near.x, 350)
        self.assertGreater(far.x, 350)

    def test_ignores_the_scoreboard_band(self):
        # Inside roi_top: a bright circle up there must not be taken as play.
        self.assertIsNone(self.detector.detect(pitch_frame((300, 8), 7)))

    def test_rejects_a_ball_bigger_than_the_ceiling(self):
        self.detector.configure({"max_radius": 12})
        self.assertIsNone(self.detector.detect(pitch_frame((300, 200), 40)))

    def test_rejects_a_ball_smaller_than_the_floor(self):
        self.detector.configure({"min_radius": 20})
        self.assertIsNone(self.detector.detect(pitch_frame((300, 200), 5)))

    def test_survives_an_empty_frame(self):
        self.assertIsNone(self.detector.detect(np.zeros((0, 0, 3), np.uint8)))
        self.assertEqual(self.detector.candidates(None), [])

    def test_candidates_come_back_best_first(self):
        frame = pitch_frame((150, 150), 8)
        cv2.circle(frame, (520, 260), 8, BALL, -1)
        found = self.detector.candidates(frame)
        self.assertGreaterEqual(len(found), 2)
        self.assertGreaterEqual(found[0].score, found[1].score)


@unittest.skipUnless(HAVE_CV, "opencv/numpy not installed")
class TestCalibration(unittest.TestCase):
    def test_sampling_a_click_builds_usable_bounds(self):
        profile = BallDetector.sample_profile(pitch_frame((300, 200), 14),
                                              300, 200)
        self.assertIn("hsv_low", profile)
        self.assertIn("hsv_high", profile)
        for low, high in zip(profile["hsv_low"], profile["hsv_high"]):
            self.assertLessEqual(low, high)

    def test_a_sampled_profile_then_finds_that_ball(self):
        frame = pitch_frame((300, 200), 14)
        detector = BallDetector({
            **DEFAULTS["games"]["illegal_soccer"]["vision"],
            **BallDetector.sample_profile(frame, 300, 200)})
        found = detector.detect(frame)
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found.x, 300, delta=5)

    def test_sampling_off_the_edge_is_harmless(self):
        self.assertEqual(
            BallDetector.sample_profile(pitch_frame(None), -50, -50), {})


@unittest.skipUnless(HAVE_CV, "opencv/numpy not installed")
class TestColourProfiles(unittest.TestCase):
    def test_a_hue_range_that_wraps_past_red_still_works(self):
        frame = np.full((200, 200, 3), (40, 40, 40), np.uint8)
        cv2.circle(frame, (100, 100), 12, (40, 40, 230), -1)   # a red ball
        detector = BallDetector({"hsv_low": [170, 90, 90],
                                 "hsv_high": [10, 255, 255],
                                 "min_radius": 4, "max_radius": 60,
                                 "min_circularity": 0.5, "min_fill": 0.5,
                                 "motion_assist": False,
                                 "roi_top": 0.0, "roi_bottom": 1.0})
        found = detector.detect(frame)
        self.assertIsNotNone(found)
        self.assertAlmostEqual(found.x, 100, delta=5)

    def test_malformed_bounds_fall_back_instead_of_crashing(self):
        detector = BallDetector({"hsv_low": "nonsense", "hsv_high": None,
                                 "motion_assist": False})
        detector.detect(pitch_frame((300, 200), 10))   # must not raise


if __name__ == "__main__":
    unittest.main()
