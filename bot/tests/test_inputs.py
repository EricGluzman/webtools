"""Input: that the right keys go down, and that they all come back up."""

import unittest

from pilot.core.inputs import (DryBackend, InputController, is_mouse,
                               make_backend, normalise_key)

KEYS = {"forward": "w", "left": "a", "right": "d", "sprint": "shift",
        "dive": "mouse_right", "punch": "mouse_left", "lob": "f"}


class TestNames(unittest.TestCase):
    def test_accepts_the_spellings_people_type(self):
        self.assertEqual(normalise_key("LMB"), "mouse_left")
        self.assertEqual(normalise_key(" RMB "), "mouse_right")
        self.assertEqual(normalise_key("MMB"), "mouse_middle")
        self.assertEqual(normalise_key("Spacebar"), "space")
        self.assertEqual(normalise_key("Esc"), "escape")

    def test_plain_keys_pass_through_lowercased(self):
        self.assertEqual(normalise_key("F"), "f")
        self.assertEqual(normalise_key("Shift"), "shift")

    def test_mouse_detection(self):
        self.assertTrue(is_mouse("RMB"))
        self.assertFalse(is_mouse("f"))

    def test_empty_input_is_survivable(self):
        self.assertEqual(normalise_key(None), "")
        self.assertEqual(normalise_key(""), "")


class TestHolding(unittest.TestCase):
    def setUp(self):
        self.backend = DryBackend()
        self.controller = InputController(KEYS, self.backend)

    def test_pressing_and_releasing_the_difference_only(self):
        self.controller.apply_hold(["left", "sprint"])
        self.controller.apply_hold(["left"])
        self.assertIn(("key_up", "shift"), self.backend.events)
        # 'a' was wanted both times, so it must not have been re-pressed.
        self.assertEqual(
            sum(1 for e in self.backend.events if e == ("key_down", "a")), 1)

    def test_unknown_logical_names_are_ignored(self):
        self.controller.apply_hold(["left", "teleport"])
        self.assertEqual(self.controller.held, {"a"})

    def test_release_all_clears_everything(self):
        self.controller.apply_hold(["left", "sprint", "forward"])
        self.controller.release_all()
        self.assertEqual(self.controller.held, set())
        for key in ("a", "shift", "w"):
            self.assertIn(("key_up", key), self.backend.events)

    def test_release_all_is_safe_twice(self):
        self.controller.apply_hold(["left"])
        self.controller.release_all()
        before = len(self.backend.events)
        self.controller.release_all()
        self.assertEqual(len(self.backend.events), before)


class TestTapping(unittest.TestCase):
    def setUp(self):
        self.backend = DryBackend()
        self.controller = InputController(KEYS, self.backend, tap_duration=0.05)

    def test_a_tap_presses_now_and_releases_later(self):
        self.controller.tap("dive")
        self.assertIn(("mouse_down", "mouse_right"), self.backend.events)
        self.assertNotIn(("mouse_up", "mouse_right"), self.backend.events)
        self.controller.pump(now=1e9)
        self.assertIn(("mouse_up", "mouse_right"), self.backend.events)

    def test_pump_before_the_duration_keeps_it_down(self):
        import time
        self.controller.tap("lob")
        self.controller.pump(now=time.monotonic())
        self.assertNotIn(("key_up", "f"), self.backend.events)

    def test_release_all_drops_a_tap_still_in_flight(self):
        self.controller.tap("punch")
        self.controller.release_all()
        self.assertIn(("mouse_up", "mouse_left"), self.backend.events)

    def test_a_held_key_is_not_re_tapped(self):
        self.controller.apply_hold(["left"])
        self.backend.events.clear()
        self.controller.tap("left")
        self.assertEqual(self.backend.events, [])

    def test_disabled_controller_sends_nothing(self):
        self.controller.enabled = False
        self.controller.apply_hold(["left"])
        self.controller.tap("dive")
        self.controller.look(30)
        self.assertEqual(self.backend.events, [])


class TestLook(unittest.TestCase):
    def setUp(self):
        self.backend = DryBackend()
        self.controller = InputController(KEYS, self.backend)

    def test_camera_steps_are_capped(self):
        self.controller.look(10_000, 0, limit=45)
        self.assertEqual(self.backend.events[-1], ("move", (45, 0)))
        self.controller.look(-10_000, 0, limit=45)
        self.assertEqual(self.backend.events[-1], ("move", (-45, 0)))

    def test_a_zero_nudge_sends_nothing(self):
        self.controller.look(0.2, 0.2)
        self.assertEqual(self.backend.events, [])


class TestKeymapSwap(unittest.TestCase):
    def test_rebinding_releases_what_was_held(self):
        backend = DryBackend()
        controller = InputController(KEYS, backend)
        controller.apply_hold(["dive"])
        controller.set_keymap({**KEYS, "dive": "mouse_left"})
        self.assertIn(("mouse_up", "mouse_right"), backend.events)
        self.assertEqual(controller.bound("dive"), "mouse_left")

    def test_keymaps_are_normalised_on_the_way_in(self):
        controller = InputController({"dive": "RMB"}, DryBackend())
        self.assertEqual(controller.bound("dive"), "mouse_right")


class TestBackendChoice(unittest.TestCase):
    def test_dry_can_always_be_asked_for(self):
        self.assertEqual(make_backend("dry").name, "dry")

    def test_auto_always_returns_something_usable(self):
        self.assertTrue(hasattr(make_backend("auto"), "key_down"))


if __name__ == "__main__":
    unittest.main()
