"""Sending keystrokes and mouse movement to the game.

Games written against DirectInput usually ignore synthetic key events that
carry only a virtual key code, so the Windows backend sends hardware *scan*
codes through ``SendInput`` — the same path a real keyboard takes.  Nothing
here attaches to, reads or modifies the game process; it is the OS input queue
and nothing else.

Every backend tracks what it is holding so :meth:`InputController.release_all`
can put the keyboard back the way it found it the moment the bot stops.
"""

from __future__ import annotations

import ctypes
import os
import time
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

MOUSE_NAMES = {"mouse_left", "mouse_right", "mouse_middle"}

# Set-1 keyboard scan codes: what the hardware actually puts on the wire.
SCAN_CODES: Dict[str, int] = {
    "escape": 0x01, "1": 0x02, "2": 0x03, "3": 0x04, "4": 0x05, "5": 0x06,
    "6": 0x07, "7": 0x08, "8": 0x09, "9": 0x0A, "0": 0x0B, "minus": 0x0C,
    "equals": 0x0D, "backspace": 0x0E, "tab": 0x0F,
    "q": 0x10, "w": 0x11, "e": 0x12, "r": 0x13, "t": 0x14, "y": 0x15,
    "u": 0x16, "i": 0x17, "o": 0x18, "p": 0x19,
    "enter": 0x1C, "ctrl": 0x1D, "lctrl": 0x1D,
    "a": 0x1E, "s": 0x1F, "d": 0x20, "f": 0x21, "g": 0x22, "h": 0x23,
    "j": 0x24, "k": 0x25, "l": 0x26,
    "shift": 0x2A, "lshift": 0x2A, "backslash": 0x2B,
    "z": 0x2C, "x": 0x2D, "c": 0x2E, "v": 0x2F, "b": 0x30, "n": 0x31,
    "m": 0x32, "comma": 0x33, "period": 0x34, "slash": 0x35,
    "rshift": 0x36, "alt": 0x38, "lalt": 0x38, "space": 0x39,
    "capslock": 0x3A,
    "f1": 0x3B, "f2": 0x3C, "f3": 0x3D, "f4": 0x3E, "f5": 0x3F, "f6": 0x40,
    "f7": 0x41, "f8": 0x42, "f9": 0x43, "f10": 0x44, "f11": 0x57, "f12": 0x58,
}

# Virtual key codes, only needed for polling the global hotkeys.
VIRTUAL_KEYS: Dict[str, int] = {
    "f1": 0x70, "f2": 0x71, "f3": 0x72, "f4": 0x73, "f5": 0x74, "f6": 0x75,
    "f7": 0x76, "f8": 0x77, "f9": 0x78, "f10": 0x79, "f11": 0x7A, "f12": 0x7B,
    "escape": 0x1B, "space": 0x20, "enter": 0x0D, "tab": 0x09,
    "pause": 0x13, "insert": 0x2D, "delete": 0x2E, "home": 0x24, "end": 0x23,
}
VIRTUAL_KEYS.update({chr(c): c for c in range(ord("A"), ord("Z") + 1)})
VIRTUAL_KEYS.update({chr(c): c for c in range(ord("0"), ord("9") + 1)})


def normalise_key(name: str) -> str:
    """Accept the spellings a person would actually type in the keybind box."""
    key = str(name or "").strip().lower()
    aliases = {
        "lmb": "mouse_left", "rmb": "mouse_right", "mmb": "mouse_middle",
        "left click": "mouse_left", "right click": "mouse_right",
        "middle click": "mouse_middle", "leftmouse": "mouse_left",
        "rightmouse": "mouse_right", "spacebar": "space", "esc": "escape",
        "return": "enter", "control": "ctrl", "lmouse": "mouse_left",
        "rmouse": "mouse_right",
    }
    return aliases.get(key, key)


def is_mouse(name: str) -> bool:
    return normalise_key(name) in MOUSE_NAMES


# --------------------------------------------------------------------- backends

class Backend:
    """What every input backend has to be able to do."""

    name = "none"
    available = False

    def key_down(self, key: str) -> None: ...
    def key_up(self, key: str) -> None: ...
    def mouse_down(self, button: str) -> None: ...
    def mouse_up(self, button: str) -> None: ...
    def move(self, dx: int, dy: int) -> None: ...


class DryBackend(Backend):
    """Records what would have been sent. Used for tests and dry runs."""

    name = "dry"
    available = True

    def __init__(self) -> None:
        self.events: List[Tuple[str, Any]] = []

    def key_down(self, key: str) -> None:
        self.events.append(("key_down", key))

    def key_up(self, key: str) -> None:
        self.events.append(("key_up", key))

    def mouse_down(self, button: str) -> None:
        self.events.append(("mouse_down", button))

    def mouse_up(self, button: str) -> None:
        self.events.append(("mouse_up", button))

    def move(self, dx: int, dy: int) -> None:
        self.events.append(("move", (dx, dy)))


if os.name == "nt":  # pragma: no cover - Windows only
    _ULONG_PTR = ctypes.c_ulonglong if ctypes.sizeof(
        ctypes.c_void_p) == 8 else ctypes.c_ulong

    class _KeyInput(ctypes.Structure):
        _fields_ = [("wVk", ctypes.c_ushort), ("wScan", ctypes.c_ushort),
                    ("dwFlags", ctypes.c_ulong), ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.POINTER(_ULONG_PTR))]

    class _MouseInput(ctypes.Structure):
        _fields_ = [("dx", ctypes.c_long), ("dy", ctypes.c_long),
                    ("mouseData", ctypes.c_ulong), ("dwFlags", ctypes.c_ulong),
                    ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.POINTER(_ULONG_PTR))]

    class _HardwareInput(ctypes.Structure):
        _fields_ = [("uMsg", ctypes.c_ulong), ("wParamL", ctypes.c_short),
                    ("wParamH", ctypes.c_ushort)]

    class _InputUnion(ctypes.Union):
        _fields_ = [("ki", _KeyInput), ("mi", _MouseInput),
                    ("hi", _HardwareInput)]

    class _Input(ctypes.Structure):
        _fields_ = [("type", ctypes.c_ulong), ("union", _InputUnion)]


class WindowsBackend(Backend):
    """Scan-code ``SendInput``: the path DirectInput games actually listen to."""

    name = "windows"

    KEYEVENTF_SCANCODE = 0x0008
    KEYEVENTF_KEYUP = 0x0002
    KEYEVENTF_EXTENDEDKEY = 0x0001
    MOUSEEVENTF_MOVE = 0x0001
    BUTTON_FLAGS = {
        "mouse_left": (0x0002, 0x0004),
        "mouse_right": (0x0008, 0x0010),
        "mouse_middle": (0x0020, 0x0040),
    }

    def __init__(self) -> None:
        self.available = os.name == "nt"
        self._user32 = ctypes.windll.user32 if self.available else None

    def _send_key(self, key: str, flags: int) -> None:
        scan = SCAN_CODES.get(normalise_key(key))
        if scan is None or not self.available:
            return
        payload = _Input(type=1)
        payload.union.ki = _KeyInput(0, scan,
                                     flags | self.KEYEVENTF_SCANCODE, 0, None)
        self._user32.SendInput(1, ctypes.byref(payload), ctypes.sizeof(payload))

    def key_down(self, key: str) -> None:
        self._send_key(key, 0)

    def key_up(self, key: str) -> None:
        self._send_key(key, self.KEYEVENTF_KEYUP)

    def _send_mouse(self, flags: int, dx: int = 0, dy: int = 0) -> None:
        if not self.available:
            return
        payload = _Input(type=0)
        payload.union.mi = _MouseInput(dx, dy, 0, flags, 0, None)
        self._user32.SendInput(1, ctypes.byref(payload), ctypes.sizeof(payload))

    def mouse_down(self, button: str) -> None:
        flags = self.BUTTON_FLAGS.get(normalise_key(button))
        if flags:
            self._send_mouse(flags[0])

    def mouse_up(self, button: str) -> None:
        flags = self.BUTTON_FLAGS.get(normalise_key(button))
        if flags:
            self._send_mouse(flags[1])

    def move(self, dx: int, dy: int) -> None:
        if dx or dy:
            self._send_mouse(self.MOUSEEVENTF_MOVE, int(dx), int(dy))


class PynputBackend(Backend):
    """Cross-platform fallback; fine for testing, weaker inside games."""

    name = "pynput"

    def __init__(self) -> None:
        self.available = False
        try:
            from pynput import keyboard, mouse  # type: ignore
        except Exception:
            return
        self._keyboard_mod = keyboard
        self._keyboard = keyboard.Controller()
        self._mouse = mouse.Controller()
        self._buttons = {
            "mouse_left": mouse.Button.left,
            "mouse_right": mouse.Button.right,
            "mouse_middle": mouse.Button.middle,
        }
        self.available = True

    def _resolve(self, key: str) -> Any:
        name = normalise_key(key)
        special = {
            "space": "space", "shift": "shift", "ctrl": "ctrl", "alt": "alt",
            "enter": "enter", "tab": "tab", "escape": "esc",
            "backspace": "backspace",
        }
        if name in special:
            return getattr(self._keyboard_mod.Key, special[name])
        if name.startswith("f") and name[1:].isdigit():
            return getattr(self._keyboard_mod.Key, name, None)
        return name[0] if name else None

    def key_down(self, key: str) -> None:
        resolved = self._resolve(key)
        if resolved is not None:
            self._keyboard.press(resolved)

    def key_up(self, key: str) -> None:
        resolved = self._resolve(key)
        if resolved is not None:
            self._keyboard.release(resolved)

    def mouse_down(self, button: str) -> None:
        target = self._buttons.get(normalise_key(button))
        if target:
            self._mouse.press(target)

    def mouse_up(self, button: str) -> None:
        target = self._buttons.get(normalise_key(button))
        if target:
            self._mouse.release(target)

    def move(self, dx: int, dy: int) -> None:
        if dx or dy:
            self._mouse.move(int(dx), int(dy))


def make_backend(preference: str = "auto") -> Backend:
    """Pick the best backend available, or the one the config insists on."""
    choice = (preference or "auto").lower()
    if choice == "dry":
        return DryBackend()
    if choice in ("windows", "auto") and os.name == "nt":
        backend = WindowsBackend()
        if backend.available:
            return backend
    if choice in ("pynput", "auto"):
        backend = PynputBackend()
        if backend.available:
            return backend
    return DryBackend()


# ------------------------------------------------------------------ controller

class InputController:
    """Translates logical actions ("dive") into presses of the bound keys.

    The brain says *what*; the keymap says *which key*; this class handles the
    bookkeeping of what is currently held so nothing is ever left stuck down.
    """

    def __init__(self, keymap: Dict[str, str], backend: Backend | None = None,
                 tap_duration: float = 0.045) -> None:
        self.keymap = {k: normalise_key(v) for k, v in (keymap or {}).items()}
        self.backend = backend or DryBackend()
        self.tap_duration = tap_duration
        self._held: Set[str] = set()
        self._pending_release: List[Tuple[str, float]] = []
        self.enabled = True

    def set_keymap(self, keymap: Dict[str, str]) -> None:
        self.release_all()
        self.keymap = {k: normalise_key(v) for k, v in (keymap or {}).items()}

    def bound(self, logical: str) -> Optional[str]:
        return self.keymap.get(logical)

    # -- primitives ---------------------------------------------------------

    def _down(self, physical: str) -> None:
        if is_mouse(physical):
            self.backend.mouse_down(physical)
        else:
            self.backend.key_down(physical)

    def _up(self, physical: str) -> None:
        if is_mouse(physical):
            self.backend.mouse_up(physical)
        else:
            self.backend.key_up(physical)

    # -- public API ---------------------------------------------------------

    def apply_hold(self, logical_names: Iterable[str]) -> None:
        """Make the held set exactly ``logical_names`` — press and release the diff."""
        if not self.enabled:
            return
        wanted = {self.keymap[n] for n in logical_names if n in self.keymap}
        for physical in self._held - wanted:
            self._up(physical)
        for physical in wanted - self._held:
            self._down(physical)
        self._held = wanted

    def tap(self, logical: str) -> None:
        """A press now, released a few milliseconds later by :meth:`pump`.

        Deferring the release keeps the control loop from blocking on a sleep,
        while still giving the game a press long enough to register.
        """
        if not self.enabled:
            return
        physical = self.keymap.get(logical)
        if not physical or physical in self._held:
            return
        self._down(physical)
        self._pending_release.append((physical, time.monotonic() + self.tap_duration))

    def pump(self, now: Optional[float] = None) -> None:
        """Release any taps whose press time is up. Call once per tick."""
        moment = now if now is not None else time.monotonic()
        still_pending: List[Tuple[str, float]] = []
        for physical, due in self._pending_release:
            if moment >= due:
                self._up(physical)
            else:
                still_pending.append((physical, due))
        self._pending_release = still_pending

    def look(self, dx: float, dy: float = 0.0, limit: int = 45) -> None:
        """Nudge the view. Steps are capped so the camera pans, not snaps."""
        if not self.enabled:
            return
        step_x = int(max(-limit, min(limit, dx)))
        step_y = int(max(-limit, min(limit, dy)))
        if step_x or step_y:
            self.backend.move(step_x, step_y)

    def release_all(self) -> None:
        """Let go of everything. Safe to call twice; called on every stop."""
        for physical in list(self._held):
            self._up(physical)
        self._held.clear()
        for physical, _ in self._pending_release:
            self._up(physical)
        self._pending_release.clear()

    @property
    def held(self) -> Set[str]:
        return set(self._held)
