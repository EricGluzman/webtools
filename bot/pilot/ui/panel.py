"""The screen you leave open while the bot plays.

Start and stop live here, along with everything needed to tell at a glance
whether the bot is actually seeing the ball: the state it is in, the keys it is
sending, and a preview of the frame with the ball ringed.
"""

from __future__ import annotations

import time
import tkinter as tk
from tkinter import ttk
from typing import Any, Callable, Optional

from ..core.capture import ScreenCapture
from ..core.config import Config
from ..core.loop import BotLoop, Telemetry
from . import theme
from .preview import PreviewCanvas
from .widgets import Card, LogView, Pill, Stat


class BotPanel(tk.Frame):
    """Drives one :class:`BotLoop` and shows what it is doing."""

    def __init__(self, master: tk.Misc, fonts: dict, config: Config, game: Any,
                 role: Any, on_back: Callable[[], None],
                 on_settings: Callable[[], None]) -> None:
        super().__init__(master, bg=theme.BG)
        self.fonts = fonts
        self.config = config
        self.game = game
        self.role = role
        self.on_back = on_back
        self.on_settings = on_settings

        self.loop: Optional[BotLoop] = None
        self._telemetry = Telemetry()
        self._pending_logs: list = []
        self._last_preview = 0.0
        self._ui_job: Optional[str] = None

        self._build()
        self._schedule_refresh()

    # ----------------------------------------------------------------- layout

    def _build(self) -> None:
        top = tk.Frame(self, bg=theme.BG)
        top.pack(fill="x", padx=24, pady=(20, 12))

        back = tk.Label(top, text="‹  Roles", bg=theme.BG, fg=theme.MUTED,
                        font=self.fonts["body"], cursor="hand2")
        back.pack(side="left")
        back.bind("<Button-1>", lambda _e: self._leave())

        ttk.Button(top, text="Settings", style="Ghost.TButton",
                   command=self.on_settings).pack(side="right")

        title = tk.Frame(self, bg=theme.BG)
        title.pack(fill="x", padx=24)
        tk.Label(title, text="%s · %s" % (self.role.name, self.game.name),
                 bg=theme.BG, fg=theme.TEXT,
                 font=self.fonts["title"]).pack(side="left")
        self.state_pill = Pill(title, "stopped", theme.MUTED,
                               font=self.fonts["small"])
        self.state_pill.pack(side="right", pady=4)

        body = tk.Frame(self, bg=theme.BG)
        body.pack(fill="both", expand=True, padx=24, pady=(16, 20))
        body.columnconfigure(0, weight=3, uniform="panel")
        body.columnconfigure(1, weight=2, uniform="panel")
        body.rowconfigure(1, weight=1)

        self._build_controls(body)
        self._build_preview(body)
        self._build_readout(body)
        self._build_log(body)

    def _build_controls(self, master: tk.Misc) -> None:
        card = Card(master, padding=14)
        card.grid(row=0, column=0, sticky="nsew", padx=(0, 8), pady=(0, 12))
        inner = card.inner

        buttons = tk.Frame(inner, bg=theme.SURFACE)
        buttons.pack(fill="x")

        self.start_button = ttk.Button(buttons, text="Start bot",
                                       style="Accent.TButton",
                                       command=self.start)
        self.start_button.pack(side="left")
        self.pause_button = ttk.Button(buttons, text="Pause", command=self.pause,
                                       state="disabled")
        self.pause_button.pack(side="left", padx=8)
        self.stop_button = ttk.Button(buttons, text="Stop", style="Danger.TButton",
                                      command=self.stop, state="disabled")
        self.stop_button.pack(side="left")

        toggle = str(self.config.get("hotkeys.toggle", "f8")).upper()
        panic = str(self.config.get("hotkeys.stop", "f9")).upper()
        tk.Label(inner,
                 text="%s pauses and resumes · %s is the panic stop. Both work "
                      "while the game has focus." % (toggle, panic),
                 bg=theme.SURFACE, fg=theme.MUTED, font=self.fonts["small"],
                 wraplength=420, justify="left").pack(anchor="w", pady=(10, 0))

    def _build_preview(self, master: tk.Misc) -> None:
        card = Card(master, padding=12)
        card.grid(row=0, column=1, rowspan=2, sticky="nsew", padx=(8, 0),
                  pady=(0, 12))
        inner = card.inner

        header = tk.Frame(inner, bg=theme.SURFACE)
        header.pack(fill="x", pady=(0, 8))
        tk.Label(header, text="What the bot sees", bg=theme.SURFACE,
                 fg=theme.TEXT, font=self.fonts["heading"]).pack(side="left")
        self.fps_label = tk.Label(header, text="-- fps", bg=theme.SURFACE,
                                  fg=theme.MUTED, font=self.fonts["small"])
        self.fps_label.pack(side="right")

        self.preview = PreviewCanvas(inner, width=360, height=203)
        self.preview.pack(fill="x")

        self.note_label = tk.Label(inner, text="", bg=theme.SURFACE,
                                   fg=theme.MUTED, font=self.fonts["small"],
                                   wraplength=340, justify="left")
        self.note_label.pack(anchor="w", pady=(8, 0))

        self.action_label = tk.Label(inner, text="", bg=theme.SURFACE,
                                     fg=theme.ACCENT, font=self.fonts["mono"],
                                     wraplength=340, justify="left")
        self.action_label.pack(anchor="w", pady=(4, 0))

    def _build_readout(self, master: tk.Misc) -> None:
        card = Card(master, padding=14)
        card.grid(row=1, column=0, sticky="nsew", padx=(0, 8), pady=(0, 12))
        inner = card.inner

        stats = tk.Frame(inner, bg=theme.SURFACE)
        stats.pack(fill="x")
        for column in range(4):
            stats.columnconfigure(column, weight=1, uniform="stat")

        self.stat_ball = Stat(stats, "ball", "lost", self.fonts)
        self.stat_ball.grid(row=0, column=0, sticky="w")
        self.stat_distance = Stat(stats, "radius px", "-", self.fonts)
        self.stat_distance.grid(row=0, column=1, sticky="w")
        self.stat_speed = Stat(stats, "speed px/s", "-", self.fonts)
        self.stat_speed.grid(row=0, column=2, sticky="w")
        self.stat_saves = Stat(stats, "saves tried", "0", self.fonts)
        self.stat_saves.grid(row=0, column=3, sticky="w")

        self.warning = tk.Label(inner, text="", bg=theme.SURFACE, fg=theme.WARN,
                                font=self.fonts["small"], wraplength=440,
                                justify="left")
        self.warning.pack(anchor="w", pady=(12, 0))

    def _build_log(self, master: tk.Misc) -> None:
        card = Card(master, padding=12)
        card.grid(row=2, column=0, columnspan=2, sticky="nsew")
        tk.Label(card.inner, text="Log", bg=theme.SURFACE, fg=theme.TEXT,
                 font=self.fonts["heading"]).pack(anchor="w", pady=(0, 8))
        self.log = LogView(card.inner, self.fonts, height=7)
        self.log.pack(fill="both", expand=True)
        self._log("Ready. Load into a match as goalkeeper, then press Start.")

    # ---------------------------------------------------------------- control

    def _log(self, message: str) -> None:
        self.log.append("%s  %s" % (time.strftime("%H:%M:%S"), message))

    def _queue_log(self, message: str) -> None:
        """Called from the bot thread; the UI drains this on its own tick."""
        self._pending_logs.append(message)

    def _on_telemetry(self, telemetry: Telemetry) -> None:
        self._telemetry = telemetry

    def start(self) -> None:
        if self.loop and self.loop.running:
            return
        if not ScreenCapture.available():
            self._log("Cannot start: screen capture needs mss and opencv. "
                      "Run: pip install -r requirements.txt")
            self.warning.configure(
                text="Missing dependencies - run pip install -r requirements.txt")
            return
        if not self.role.build or not self.role.detector:
            self._log("This role has no brain yet.")
            return

        brain = self.role.build(self.config)
        detector = self.role.detector(self.config)
        self.loop = BotLoop(self.config, self.game.key, brain, detector,
                            on_telemetry=self._on_telemetry,
                            on_log=self._queue_log)
        self.loop.start()

        self.start_button.configure(state="disabled")
        self.pause_button.configure(state="normal")
        self.stop_button.configure(state="normal")

    def pause(self) -> None:
        if self.loop and self.loop.running:
            self.loop.toggle_pause()
            self.pause_button.configure(
                text="Resume" if self.loop.paused else "Pause")

    def stop(self) -> None:
        if self.loop:
            self.loop.stop()
        self.start_button.configure(state="normal")
        self.pause_button.configure(state="disabled", text="Pause")
        self.stop_button.configure(state="disabled")
        self.preview.clear()

    def _leave(self) -> None:
        self.stop()
        self.on_back()

    def destroy(self) -> None:
        if self._ui_job is not None:
            try:
                self.after_cancel(self._ui_job)
            except tk.TclError:
                pass
            self._ui_job = None
        if self.loop:
            self.loop.stop()
        super().destroy()

    # ---------------------------------------------------------------- refresh

    def _schedule_refresh(self) -> None:
        self._ui_job = self.after(80, self._refresh)

    def _refresh(self) -> None:
        try:
            self._drain_logs()
            self._paint_telemetry()
            self._paint_preview()
        finally:
            self._schedule_refresh()

    def _drain_logs(self) -> None:
        while self._pending_logs:
            self._log(self._pending_logs.pop(0))

    def _paint_telemetry(self) -> None:
        telemetry = self._telemetry
        running = bool(self.loop and self.loop.running)

        state = telemetry.state if running else "stopped"
        self.state_pill.update_state(state, theme.state_colour(state))
        self.note_label.configure(text=telemetry.note or "")
        self.action_label.configure(text=telemetry.action or "")
        self.fps_label.configure(
            text="%.0f fps" % telemetry.fps if running and telemetry.fps else "-- fps")

        if telemetry.ball_visible:
            self.stat_ball.set("seen", theme.GOOD)
            self.stat_distance.set("%.0f" % telemetry.ball_radius, theme.TEXT)
            self.stat_speed.set("%.0f" % telemetry.ball_speed, theme.TEXT)
        else:
            self.stat_ball.set("lost", theme.WARN if running else theme.MUTED)
            self.stat_distance.set("-", theme.MUTED)
            self.stat_speed.set("-", theme.MUTED)
        self.stat_saves.set(str(telemetry.saves))

        if telemetry.error:
            self.warning.configure(text=telemetry.error, fg=theme.BAD)
        elif running and not telemetry.focused:
            self.warning.configure(
                text="Waiting for the game window - click into Roblox and the "
                     "bot picks straight up.", fg=theme.WARN)
        elif running and telemetry.backend == "dry":
            self.warning.configure(
                text="No input backend: keys are being decided but not sent. "
                     "On Windows this should say 'windows'.", fg=theme.WARN)
        else:
            self.warning.configure(text="")

    def _paint_preview(self) -> None:
        if not (self.loop and self.loop.running):
            return
        if not bool(self.config.get("ui.show_preview", True)):
            return

        interval = 1.0 / max(1.0, float(self.config.get("ui.preview_fps", 12) or 12))
        now = time.monotonic()
        if now - self._last_preview < interval:
            return
        self._last_preview = now

        grab, ball = self.loop.snapshot()
        if grab is None:
            return
        tuning = self.config.section(
            "games.%s.%s" % (self.game.key, self.role.key))
        try:
            self.preview.render(grab.image, ball, tuning)
        except tk.TclError:  # pragma: no cover - window closing mid-draw
            pass
