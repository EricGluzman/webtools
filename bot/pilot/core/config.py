"""Configuration: defaults, disk persistence and dotted-path access.

Everything the pilot might need to retune lives here rather than in the code —
keybinds, the colour the ball is expected to be, how eagerly the keeper commits
to a dive.  Settings are merged over the defaults on load, so a config written
by an older version still starts and simply picks up any new keys.
"""

from __future__ import annotations

import copy
import json
import os
from pathlib import Path
from typing import Any, Dict

CONFIG_VERSION = 1


def config_path() -> Path:
    """Where the settings file lives (override with ``PILOT_CONFIG``)."""
    override = os.environ.get("PILOT_CONFIG")
    if override:
        return Path(override).expanduser()
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "roblox-pilot" / "config.json"


DEFAULTS: Dict[str, Any] = {
    "version": CONFIG_VERSION,
    "capture": {
        # 0 is "all monitors stitched together"; 1 is the primary screen.
        "monitor": 1,
        # [x, y, w, h] in screen pixels, or null for the whole monitor.
        "region": None,
        "target_fps": 30,
        # Frames are shrunk before analysis: less to chew through per frame,
        # and the ball is still several pixels across at half size.
        "analysis_width": 640,
    },
    "window": {
        # Refuse to send input unless the game is the focused window, so a
        # forgotten bot cannot type into your editor.
        "require_focus": True,
        "title_contains": "Roblox",
    },
    "input": {
        "backend": "auto",          # auto | windows | pynput | dry
        "camera_enabled": True,
        "camera_gain": 2.6,         # pixels of mouse travel per pixel of error
        "camera_max_step": 45,      # per tick, keeps the view from snapping
    },
    "hotkeys": {
        "toggle": "f8",
        "stop": "f9",
    },
    "safety": {
        # Stop everything once the bot has been running this long. 0 disables.
        "max_run_minutes": 0,
    },
    "ui": {
        "show_preview": True,
        "preview_fps": 12,
    },
    "games": {
        "illegal_soccer": {
            "keys": {
                "forward": "w",
                "back": "s",
                "left": "a",
                "right": "d",
                "sprint": "shift",
                "jump": "space",
                # From the in-game goalkeeper HUD: Punch, Dive, Lob (F),
                # Request (R). Swap the two mouse buttons here if your bind
                # sheet has them the other way round.
                "punch": "mouse_left",
                "dive": "mouse_right",
                "lob": "f",
                "request": "r",
            },
            "vision": {
                # The match ball reads as a bright, washed-out blob: high
                # value, low saturation. Calibrate to sample the real thing.
                "hsv_low": [0, 0, 168],
                "hsv_high": [180, 74, 255],
                "min_radius": 3,
                "max_radius": 90,
                "min_circularity": 0.55,
                "min_fill": 0.55,
                "motion_assist": True,
                "roi_top": 0.05,     # ignore the sky / scoreboard band
                "roi_bottom": 0.97,
            },
            "goalkeeper": {
                # All positions are fractions of the analysed frame, so they
                # survive a change of resolution.
                "home_x": 0.5,
                "post_left": 0.20,
                "post_right": 0.80,
                "goal_line_y": 0.88,
                "track_deadzone": 0.045,
                "camera_deadzone": 0.035,  # how far off-centre before turning
                "line_depth": 0.18,       # how far off the line to cut angles
                "far_radius": 9.0,        # below this the ball is upfield
                "box_radius": 26.0,       # above this it is in the six-yard box
                "claim_radius": 46.0,     # close enough to come and take it
                "shot_growth": 38.0,      # radius px/s that reads as a shot
                "dive_window": 0.42,      # commit inside this many seconds
                "punch_reach": 0.11,      # fraction of width reachable standing
                "dive_cooldown": 1.15,
                "punch_cooldown": 0.45,
                "recover_time": 0.9,
                "high_ball_y": 0.55,      # above this line, punch rather than dive
                "sprint_to_claim": True,
                "distribute_with": "lob",  # lob | request | none
                "distribute_delay": 0.8,
                "search_sweep": 0.45,     # camera sweep speed when ball is lost
            },
        }
    },
}


def _deep_merge(base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    """Overlay ``override`` onto ``base`` without dropping unmentioned keys."""
    out = copy.deepcopy(base)
    for key, value in (override or {}).items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


class Config:
    """Dict-backed settings with dotted-path get/set and atomic saves."""

    def __init__(self, data: Dict[str, Any] | None = None,
                 path: Path | None = None) -> None:
        self.path = path or config_path()
        self.data = _deep_merge(DEFAULTS, data or {})

    @classmethod
    def load(cls, path: Path | None = None) -> "Config":
        target = path or config_path()
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = {}
        return cls(raw if isinstance(raw, dict) else {}, target)

    def save(self) -> None:
        """Write the config out, via a temp file so a crash cannot truncate it."""
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    def get(self, dotted: str, fallback: Any = None) -> Any:
        node: Any = self.data
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return fallback
            node = node[part]
        return node

    def set(self, dotted: str, value: Any) -> None:
        parts = dotted.split(".")
        node = self.data
        for part in parts[:-1]:
            nxt = node.get(part)
            if not isinstance(nxt, dict):
                nxt = {}
                node[part] = nxt
            node = nxt
        node[parts[-1]] = value

    def section(self, dotted: str) -> Dict[str, Any]:
        value = self.get(dotted, {})
        return value if isinstance(value, dict) else {}

    def reset_section(self, dotted: str) -> None:
        """Restore one branch (e.g. a game's tuning) to its shipped defaults."""
        node: Any = DEFAULTS
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return
            node = node[part]
        self.set(dotted, copy.deepcopy(node))
