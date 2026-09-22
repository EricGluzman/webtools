"""Settings: keybinds, capture, and the keeper's tuning.

The keybind rows matter most.  The in-game HUD shows Punch and Dive as mouse
buttons but not *which* mouse buttons, so the defaults here are a reading of
the screenshots, not gospel — click a row, press the real button, done.
"""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Any, Callable, Dict, List, Tuple

from ..core.capture import ScreenCapture
from ..core.config import Config
from ..core.inputs import normalise_key
from . import theme
from .widgets import Card

KEY_ROWS: List[Tuple[str, str, str]] = [
    ("forward", "Move forward", "Walks off the line"),
    ("back", "Move back", "Retreats towards goal"),
    ("left", "Move left", "Shuffles across"),
    ("right", "Move right", "Shuffles across"),
    ("sprint", "Sprint", "Used when rushing a loose ball"),
    ("jump", "Jump", "Kept for high balls"),
    ("punch", "Punch", "Shown on the keeper HUD as a mouse button"),
    ("dive", "Dive", "Shown on the keeper HUD as a mouse button"),
    ("lob", "Lob", "Clears the ball upfield once held"),
    ("request", "Request", "Calls for the ball"),
]

TUNING_ROWS: List[Tuple[str, str, str, float, float]] = [
    ("home_x", "Keeper position", "Where your player sits across the frame",
     0.0, 1.0),
    ("goal_line_y", "Goal line", "How far down the frame your line sits",
     0.4, 1.0),
    ("post_left", "Left post", "Furthest left the keeper will stray", 0.0, 0.5),
    ("post_right", "Right post", "Furthest right the keeper will stray",
     0.5, 1.0),
    ("line_depth", "Angle cutting", "0 stays on the line, 1 charges the ball",
     0.0, 0.8),
    ("far_radius", "Far ball size", "Below this the ball counts as upfield",
     2.0, 40.0),
    ("box_radius", "Box ball size", "Above this the ball is in the box",
     10.0, 80.0),
    ("claim_radius", "Claim size", "Above this the keeper comes to take it",
     20.0, 140.0),
    ("shot_growth", "Shot sensitivity",
     "Radius growth per second that reads as a shot", 8.0, 120.0),
    ("dive_window", "Dive timing", "Seconds before impact to commit", 0.1, 1.2),
    ("punch_reach", "Punch reach", "How far the keeper can punch standing up",
     0.02, 0.4),
    ("dive_cooldown", "Dive cooldown", "Seconds before diving again", 0.3, 3.0),
]


class KeyCaptureRow(tk.Frame):
    """One rebindable control: click, then press a key or mouse button."""

    def __init__(self, master: tk.Misc, fonts: dict, label: str, hint: str,
                 value: str, on_change: Callable[[str], None]) -> None:
        super().__init__(master, bg=theme.SURFACE)
        self.fonts = fonts
        self.on_change = on_change
        self.value = value
        self.listening = False

        text = tk.Frame(self, bg=theme.SURFACE)
        text.pack(side="left", fill="x", expand=True)
        tk.Label(text, text=label, bg=theme.SURFACE, fg=theme.TEXT,
                 font=fonts["body"]).pack(anchor="w")
        tk.Label(text, text=hint, bg=theme.SURFACE, fg=theme.MUTED,
                 font=fonts["small"]).pack(anchor="w")

        self.button = tk.Label(self, text=self._pretty(value), bg=theme.SURFACE_HI,
                               fg=theme.ACCENT, font=fonts["mono"], padx=14,
                               pady=7, cursor="hand2", width=12)
        self.button.pack(side="right")
        self.button.bind("<Button-1>", self._begin)

    @staticmethod
    def _pretty(value: str) -> str:
        names = {"mouse_left": "Left click", "mouse_right": "Right click",
                 "mouse_middle": "Middle click"}
        return names.get(value, (value or "-").upper())

    def _begin(self, _event=None) -> None:
        if self.listening:
            return
        self.listening = True
        self.button.configure(text="press…", fg=theme.WARN)
        self.button.focus_set()
        # Grab so the press lands here and not in whatever had focus before.
        self.button.grab_set()
        self.button.bind("<Key>", self._captured_key)
        self.button.bind("<Button>", self._captured_button)

    def _finish(self, value: str) -> None:
        self.listening = False
        self.button.grab_release()
        self.button.unbind("<Key>")
        self.button.unbind("<Button>")
        self.value = value
        self.button.configure(text=self._pretty(value), fg=theme.ACCENT)
        self.on_change(value)

    def _captured_key(self, event) -> str:
        name = normalise_key(event.keysym)
        if name == "escape":
            self._finish(self.value)
            return "break"
        self._finish(name)
        return "break"

    def _captured_button(self, event) -> str:
        mapping = {1: "mouse_left", 2: "mouse_middle", 3: "mouse_right"}
        button = mapping.get(event.num)
        if button:
            self._finish(button)
        return "break"


class SettingsScreen(tk.Frame):
    """Tabbed settings for one game and role."""

    def __init__(self, master: tk.Misc, fonts: dict, config: Config, game: Any,
                 role: Any, on_back: Callable[[], None]) -> None:
        super().__init__(master, bg=theme.BG)
        self.fonts = fonts
        self.config = config
        self.game = game
        self.role = role
        self.on_back = on_back
        self._tuning_vars: Dict[str, tk.DoubleVar] = {}
        self._build()

    # ----------------------------------------------------------------- layout

    def _build(self) -> None:
        top = tk.Frame(self, bg=theme.BG)
        top.pack(fill="x", padx=24, pady=(20, 8))
        back = tk.Label(top, text="‹  Back", bg=theme.BG, fg=theme.MUTED,
                        font=self.fonts["body"], cursor="hand2")
        back.pack(side="left")
        back.bind("<Button-1>", lambda _e: self._save_and_leave())

        ttk.Button(top, text="Reset this game to defaults", style="Ghost.TButton",
                   command=self._reset).pack(side="right")

        tk.Label(self, text="Settings", bg=theme.BG, fg=theme.TEXT,
                 font=self.fonts["title"]).pack(anchor="w", padx=24)

        notebook = ttk.Notebook(self)
        notebook.pack(fill="both", expand=True, padx=24, pady=(14, 20))
        notebook.add(self._controls_tab(notebook), text="Controls")
        notebook.add(self._capture_tab(notebook), text="Screen")
        notebook.add(self._tuning_tab(notebook), text="Keeper")

    def _scrollable(self, master: tk.Misc) -> tk.Frame:
        """A frame that scrolls, because the tuning tab is taller than the window."""
        outer = tk.Frame(master, bg=theme.BG)
        canvas = tk.Canvas(outer, bg=theme.BG, highlightthickness=0, bd=0)
        scroll = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview,
                               style="Vertical.TScrollbar")
        inner = tk.Frame(canvas, bg=theme.BG)

        window = canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.configure(yscrollcommand=scroll.set)
        inner.bind("<Configure>",
                   lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>",
                    lambda e: canvas.itemconfigure(window, width=e.width))
        canvas.bind_all("<MouseWheel>", lambda e: canvas.yview_scroll(
            int(-e.delta / 120), "units"))

        canvas.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        outer.inner = inner  # type: ignore[attr-defined]
        return outer

    # ------------------------------------------------------------------- tabs

    def _controls_tab(self, master: tk.Misc) -> tk.Frame:
        page = self._scrollable(master)
        body = page.inner  # type: ignore[attr-defined]

        card = Card(body, padding=16)
        card.pack(fill="x", pady=(12, 12))
        tk.Label(card.inner,
                 text="Match these to your in-game keybinds. The two mouse "
                      "buttons are a guess from the HUD screenshot - if the "
                      "keeper punches when it should dive, swap them here.",
                 bg=theme.SURFACE, fg=theme.MUTED, font=self.fonts["body"],
                 wraplength=620, justify="left").pack(anchor="w", pady=(0, 14))

        prefix = "games.%s.keys." % self.game.key
        for key, label, hint in KEY_ROWS:
            current = str(self.config.get(prefix + key, ""))
            row = KeyCaptureRow(
                card.inner, self.fonts, label, hint, current,
                lambda value, k=key: self.config.set(prefix + k, value))
            row.pack(fill="x", pady=5)
        return page

    def _capture_tab(self, master: tk.Misc) -> tk.Frame:
        page = self._scrollable(master)
        body = page.inner  # type: ignore[attr-defined]

        card = Card(body, padding=16)
        card.pack(fill="x", pady=(12, 12))

        tk.Label(card.inner, text="Which screen to watch", bg=theme.SURFACE,
                 fg=theme.TEXT, font=self.fonts["heading"]).pack(anchor="w")

        monitors = []
        try:
            monitors = ScreenCapture().monitors()
        except Exception:
            monitors = []

        options = ["0 - all screens together"] + [
            "%d - %dx%d at %d,%d" % (i, m.get("width", 0), m.get("height", 0),
                                     m.get("left", 0), m.get("top", 0))
            for i, m in enumerate(monitors) if i > 0]
        if len(options) == 1:
            options.append("1 - primary screen")

        self.monitor_var = tk.StringVar(
            value=options[min(int(self.config.get("capture.monitor", 1) or 1),
                              len(options) - 1)])
        combo = ttk.Combobox(card.inner, values=options, state="readonly",
                             textvariable=self.monitor_var)
        combo.pack(fill="x", pady=(8, 4))
        combo.bind("<<ComboboxSelected>>", self._monitor_changed)

        tk.Label(card.inner,
                 text="Full screen is usually right. Roblox in a window? Pick "
                      "the screen it is on and leave it maximised.",
                 bg=theme.SURFACE, fg=theme.MUTED, font=self.fonts["small"],
                 wraplength=620, justify="left").pack(anchor="w", pady=(0, 12))

        self._slider(card.inner, "Frames per second",
                     "How often the screen is read. 30 is plenty.",
                     "capture.target_fps", 10, 60, integer=True)
        self._slider(card.inner, "Analysis width",
                     "Frames are shrunk to this many pixels wide before "
                     "looking for the ball. Smaller is faster.",
                     "capture.analysis_width", 320, 1280, integer=True)

        guard = Card(body, padding=16)
        guard.pack(fill="x", pady=(0, 12))
        tk.Label(guard.inner, text="Safety", bg=theme.SURFACE, fg=theme.TEXT,
                 font=self.fonts["heading"]).pack(anchor="w", pady=(0, 8))

        self.focus_var = tk.BooleanVar(
            value=bool(self.config.get("window.require_focus", True)))
        ttk.Checkbutton(
            guard.inner, variable=self.focus_var,
            text="Only send input while the game window is in front",
            command=lambda: self.config.set("window.require_focus",
                                            self.focus_var.get())).pack(anchor="w")

        self.camera_var = tk.BooleanVar(
            value=bool(self.config.get("input.camera_enabled", True)))
        ttk.Checkbutton(
            guard.inner, variable=self.camera_var,
            text="Let the bot turn the camera towards the ball",
            command=lambda: self.config.set("input.camera_enabled",
                                            self.camera_var.get())).pack(
            anchor="w", pady=(6, 0))

        self._slider(guard.inner, "Camera speed",
                     "How hard the view swings to follow the ball.",
                     "input.camera_gain", 0.5, 8.0)
        return page

    def _tuning_tab(self, master: tk.Misc) -> tk.Frame:
        page = self._scrollable(master)
        body = page.inner  # type: ignore[attr-defined]

        card = Card(body, padding=16)
        card.pack(fill="x", pady=(12, 12))
        tk.Label(card.inner,
                 text="How the keeper plays. Sizes are in pixels of the "
                      "analysed frame; positions are fractions of it, so they "
                      "hold at any resolution.",
                 bg=theme.SURFACE, fg=theme.MUTED, font=self.fonts["body"],
                 wraplength=620, justify="left").pack(anchor="w", pady=(0, 12))

        prefix = "games.%s.goalkeeper." % self.game.key
        for key, label, hint, low, high in TUNING_ROWS:
            self._slider(card.inner, label, hint, prefix + key, low, high)
        return page

    # -------------------------------------------------------------- utilities

    def _slider(self, master: tk.Misc, label: str, hint: str, path: str,
                low: float, high: float, integer: bool = False) -> None:
        row = tk.Frame(master, bg=theme.SURFACE)
        row.pack(fill="x", pady=(10, 0))

        header = tk.Frame(row, bg=theme.SURFACE)
        header.pack(fill="x")
        tk.Label(header, text=label, bg=theme.SURFACE, fg=theme.TEXT,
                 font=self.fonts["body"]).pack(side="left")

        try:
            current = float(self.config.get(path, low) or low)
        except (TypeError, ValueError):
            current = low

        value_label = tk.Label(header, bg=theme.SURFACE, fg=theme.ACCENT,
                               font=self.fonts["mono"])
        value_label.pack(side="right")

        def fmt(value: float) -> str:
            return "%d" % round(value) if integer else "%.3g" % value

        value_label.configure(text=fmt(current))
        variable = tk.DoubleVar(value=current)
        self._tuning_vars[path] = variable

        def changed(_value=None) -> None:
            raw = variable.get()
            stored = int(round(raw)) if integer else round(raw, 4)
            self.config.set(path, stored)
            value_label.configure(text=fmt(raw))

        ttk.Scale(row, from_=low, to=high, variable=variable,
                  command=changed).pack(fill="x", pady=(4, 0))
        tk.Label(row, text=hint, bg=theme.SURFACE, fg=theme.MUTED,
                 font=self.fonts["small"], wraplength=600,
                 justify="left").pack(anchor="w")

    def _monitor_changed(self, _event=None) -> None:
        try:
            index = int(self.monitor_var.get().split(" ")[0])
        except (TypeError, ValueError):
            index = 1
        self.config.set("capture.monitor", index)

    def _reset(self) -> None:
        self.config.reset_section("games.%s" % self.game.key)
        self.config.save()
        self._save_and_leave()

    def _save_and_leave(self) -> None:
        self.config.save()
        self.on_back()
