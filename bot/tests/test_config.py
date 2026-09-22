"""Settings: merging, persistence and dotted access."""

import json
import tempfile
import unittest
from pathlib import Path

from pilot.core.config import DEFAULTS, Config


class TestDefaults(unittest.TestCase):
    def test_ships_with_the_keeper_controls_from_the_hud(self):
        keys = DEFAULTS["games"]["illegal_soccer"]["keys"]
        self.assertEqual(keys["lob"], "f")
        self.assertEqual(keys["request"], "r")
        self.assertTrue(keys["punch"].startswith("mouse_"))
        self.assertTrue(keys["dive"].startswith("mouse_"))
        self.assertNotEqual(keys["punch"], keys["dive"])

    def test_movement_keys_are_distinct(self):
        keys = DEFAULTS["games"]["illegal_soccer"]["keys"]
        movement = [keys["forward"], keys["back"], keys["left"], keys["right"]]
        self.assertEqual(len(set(movement)), 4)


class TestAccess(unittest.TestCase):
    def setUp(self):
        self.config = Config()

    def test_dotted_get(self):
        self.assertEqual(self.config.get("games.illegal_soccer.keys.lob"), "f")

    def test_missing_path_returns_the_fallback(self):
        self.assertEqual(self.config.get("no.such.path", "x"), "x")
        self.assertIsNone(self.config.get("games.illegal_soccer.keys.nope"))

    def test_set_creates_missing_branches(self):
        self.config.set("a.b.c", 7)
        self.assertEqual(self.config.get("a.b.c"), 7)

    def test_set_replaces_a_non_dict_on_the_way(self):
        self.config.set("capture.monitor.deep", 1)
        self.assertEqual(self.config.get("capture.monitor.deep"), 1)

    def test_section_always_returns_a_dict(self):
        self.assertIsInstance(self.config.section("games.illegal_soccer.keys"), dict)
        self.assertEqual(self.config.section("nope.nothing"), {})


class TestPersistence(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "nested" / "config.json"

    def tearDown(self):
        self.dir.cleanup()

    def test_round_trip(self):
        config = Config(path=self.path)
        config.set("games.illegal_soccer.keys.dive", "mouse_left")
        config.save()
        self.assertEqual(
            Config.load(self.path).get("games.illegal_soccer.keys.dive"),
            "mouse_left")

    def test_a_partial_file_keeps_the_other_defaults(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"capture": {"target_fps": 15}}))
        config = Config.load(self.path)
        self.assertEqual(config.get("capture.target_fps"), 15)
        # Everything it did not mention still has to be there.
        self.assertEqual(config.get("games.illegal_soccer.keys.lob"), "f")

    def test_a_corrupt_file_falls_back_to_defaults(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("{not json at all")
        self.assertEqual(
            Config.load(self.path).get("games.illegal_soccer.keys.lob"), "f")

    def test_a_missing_file_is_fine(self):
        self.assertEqual(Config.load(self.path).get("capture.target_fps"), 30)

    def test_a_non_object_file_falls_back(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text("[1, 2, 3]")
        self.assertEqual(Config.load(self.path).get("capture.target_fps"), 30)


class TestReset(unittest.TestCase):
    def test_reset_restores_one_branch_only(self):
        config = Config()
        config.set("games.illegal_soccer.keys.dive", "q")
        config.set("capture.target_fps", 12)
        config.reset_section("games.illegal_soccer.keys")
        self.assertEqual(config.get("games.illegal_soccer.keys.dive"),
                         "mouse_right")
        self.assertEqual(config.get("capture.target_fps"), 12)

    def test_resetting_an_unknown_branch_is_harmless(self):
        config = Config()
        config.reset_section("nope.nothing")
        self.assertEqual(config.get("games.illegal_soccer.keys.lob"), "f")

    def test_defaults_are_not_mutated_by_a_config(self):
        config = Config()
        config.set("games.illegal_soccer.keys.lob", "z")
        self.assertEqual(
            DEFAULTS["games"]["illegal_soccer"]["keys"]["lob"], "f")


if __name__ == "__main__":
    unittest.main()
