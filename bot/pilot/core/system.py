"""Talking to the desktop: which window has focus, and global hotkeys.

Both exist for the same reason — so the bot can never run away with your
machine.  Input is withheld unless the game itself is in front, and a panic key
works even while the game has focus and the launcher window does not.
"""

from __future__ import annotations

import ctypes
import os
from typing import Callable, Dict, Optional

from .inputs import VIRTUAL_KEYS, normalise_key


def active_window_title() -> str:
    """The title of the foreground window, or "" where that is unknowable."""
    if os.name == "nt":  # pragma: no cover - Windows only
        try:
            user32 = ctypes.windll.user32
            handle = user32.GetForegroundWindow()
            if not handle:
                return ""
            length = user32.GetWindowTextLengthW(handle)
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(handle, buffer, length + 1)
            return buffer.value or ""
        except Exception:
            return ""

    # X11: ask xdotool if it happens to be installed, otherwise give up quietly.
    try:  # pragma: no cover - depends on the desktop
        import subprocess
        out = subprocess.run(["xdotool", "getactivewindow", "getwindowname"],
                             capture_output=True, text=True, timeout=0.4)
        return (out.stdout or "").strip()
    except Exception:
        return ""


def window_is_focused(fragment: str) -> bool:
    """Is a window whose title contains ``fragment`` in front?

    An empty fragment means "do not care".  On platforms where the title cannot
    be read, this returns True rather than deadlocking the bot — the focus
    guard is a convenience, not the only safety net.
    """
    needle = (fragment or "").strip().lower()
    if not needle:
        return True
    title = active_window_title()
    if not title:
        return True
    return needle in title.lower()


class HotkeyWatcher:
    """Polls a few keys globally, so panic works from inside the game.

    Polling rather than registering avoids stealing the key from the game and
    needs no extra dependency.  Callbacks fire once per press, not per poll.
    """

    def __init__(self) -> None:
        self._bindings: Dict[str, Callable[[], None]] = {}
        self._was_down: Dict[str, bool] = {}
        self.available = os.name == "nt" or self._pynput_available()
        self._pynput_state: Dict[str, bool] = {}
        self._listener = None

    @staticmethod
    def _pynput_available() -> bool:
        try:
            from importlib.util import find_spec
            return find_spec("pynput") is not None
        except Exception:
            return False

    def bind(self, key: str, callback: Callable[[], None]) -> None:
        name = normalise_key(key)
        if name:
            self._bindings[name] = callback
            self._was_down.setdefault(name, False)

    def clear(self) -> None:
        self._bindings.clear()
        self._was_down.clear()

    def _is_down(self, name: str) -> bool:
        if os.name == "nt":  # pragma: no cover - Windows only
            code = VIRTUAL_KEYS.get(name.upper() if len(name) == 1 else name)
            if code is None:
                return False
            try:
                return bool(ctypes.windll.user32.GetAsyncKeyState(code) & 0x8000)
            except Exception:
                return False
        return self._pynput_state.get(name, False)

    def start_listener(self) -> None:
        """On non-Windows desktops, watch keys through pynput if it is there."""
        if os.name == "nt" or self._listener is not None:
            return
        try:  # pragma: no cover - depends on the desktop
            from pynput import keyboard

            def resolve(key) -> Optional[str]:
                if hasattr(key, "char") and key.char:
                    return normalise_key(key.char)
                return normalise_key(str(key).replace("Key.", ""))

            def on_press(key):
                name = resolve(key)
                if name:
                    self._pynput_state[name] = True

            def on_release(key):
                name = resolve(key)
                if name:
                    self._pynput_state[name] = False

            self._listener = keyboard.Listener(on_press=on_press,
                                               on_release=on_release)
            self._listener.daemon = True
            self._listener.start()
        except Exception:
            self._listener = None

    def stop_listener(self) -> None:
        if self._listener is not None:  # pragma: no cover
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None

    def poll(self) -> None:
        """Check every bound key once; fire callbacks on fresh presses."""
        for name, callback in list(self._bindings.items()):
            down = self._is_down(name)
            if down and not self._was_down.get(name, False):
                try:
                    callback()
                except Exception:
                    pass
            self._was_down[name] = down
