"""``--check``: report what is installed, without needing any of it.

This is the first thing to run when the pilot will not start, so it imports
nothing that might be the missing piece — tkinter included.
"""

from __future__ import annotations

from typing import List, Tuple


def _probe_module(name: str, why: str) -> Tuple[bool, str]:
    try:
        __import__(name)
        return True, "%-8s installed  (%s)" % (name, why)
    except ImportError:
        return False, "%-8s MISSING    (%s)" % (name, why)


def run() -> int:
    """Print the environment report; 0 when everything needed is present."""
    print("Roblox Pilot - environment check\n")
    checks: List[Tuple[bool, str]] = [
        _probe_module("numpy", "frame maths"),
        _probe_module("cv2", "ball detection"),
        _probe_module("mss", "screen capture"),
    ]

    ok, line = _probe_module("tkinter", "the launcher window")
    checks.append((ok, line if ok else
                   "tkinter  MISSING    (Windows: reinstall Python with "
                   "tcl/tk; Linux: apt install python3-tk)"))

    try:
        from .core.config import Config
        from .core.inputs import make_backend

        config = Config.load()
        backend = make_backend(str(config.get("input.backend", "auto")))
        sending = backend.name != "dry"
        checks.append((sending, "input    %s%s" % (
            backend.name,
            "" if sending else "  (keys would be decided but NOT sent - "
                               "on Windows this should say 'windows')")))
        config_path = str(config.path)
    except Exception as exc:  # pragma: no cover - only if the package is broken
        checks.append((False, "input    unavailable (%s)" % exc))
        config_path = "unknown"

    try:
        from .core.capture import ScreenCapture
        monitors = ScreenCapture().monitors()
        found = max(0, len(monitors) - 1)
        checks.append((found > 0, "screens  %d found" % found))
    except Exception as exc:
        checks.append((False, "screens  unavailable (%s)" % exc))

    for good, line in checks:
        print("  %s  %s" % ("OK  " if good else "FAIL", line))

    failed = [line for good, line in checks if not good]
    print("\nConfig file: %s" % config_path)
    if failed:
        print("\nFix the FAIL lines above, then run this again.")
        print("Most of them are one command:  pip install -r requirements.txt")
    else:
        print("\nAll good - run `python run.py` to open the launcher.")
    return 1 if failed else 0
