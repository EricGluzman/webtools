"""Small building blocks the screens share."""

from __future__ import annotations

import tkinter as tk
from tkinter import ttk
from typing import Callable, Optional

from . import theme


class Card(tk.Frame):
    """A padded panel with a hairline border, optionally clickable."""

    def __init__(self, master: tk.Misc, *, padding: int = 16,
                 on_click: Optional[Callable[[], None]] = None,
                 accent: Optional[str] = None, **kwargs) -> None:
        super().__init__(master, bg=theme.BORDER, **kwargs)
        self.inner = tk.Frame(self, bg=theme.SURFACE, padx=padding, pady=padding)
        self.inner.pack(fill="both", expand=True, padx=1, pady=1)
        self._accent = accent
        self._on_click = on_click
        if accent:
            stripe = tk.Frame(self.inner, bg=accent, height=3)
            stripe.pack(fill="x", pady=(0, 12))
        if on_click:
            self._bind_clicks(self)
            self.configure(cursor="hand2")

    def _bind_clicks(self, widget: tk.Misc) -> None:
        widget.bind("<Button-1>", lambda _e: self._on_click and self._on_click())
        widget.bind("<Enter>", self._hover_on)
        widget.bind("<Leave>", self._hover_off)
        for child in widget.winfo_children():
            self._bind_clicks(child)

    def bind_children(self) -> None:
        """Re-arm hover/click after adding content."""
        if self._on_click:
            self._bind_clicks(self)

    def _hover_on(self, _event=None) -> None:
        self.configure(bg=self._accent or theme.ACCENT)
        self.inner.configure(bg=theme.SURFACE_HI)
        self._recolour(self.inner, theme.SURFACE_HI)

    def _hover_off(self, _event=None) -> None:
        self.configure(bg=theme.BORDER)
        self.inner.configure(bg=theme.SURFACE)
        self._recolour(self.inner, theme.SURFACE)

    def _recolour(self, widget: tk.Misc, colour: str) -> None:
        for child in widget.winfo_children():
            if isinstance(child, (tk.Frame, tk.Label)) and \
                    child.cget("bg") in (theme.SURFACE, theme.SURFACE_HI):
                child.configure(bg=colour)
                self._recolour(child, colour)


class Pill(tk.Label):
    """A coloured status chip."""

    def __init__(self, master: tk.Misc, text: str = "", colour: str = theme.MUTED,
                 **kwargs) -> None:
        super().__init__(master, text=text.upper(), bg=theme.SURFACE_HI,
                         fg=colour, padx=10, pady=4, **kwargs)
        self._colour = colour

    def update_state(self, text: str, colour: str) -> None:
        self.configure(text=(text or "").upper(), fg=colour)


class Stat(tk.Frame):
    """A big number with a caption under it."""

    def __init__(self, master: tk.Misc, caption: str, value: str = "-",
                 fonts: Optional[dict] = None, **kwargs) -> None:
        super().__init__(master, bg=theme.SURFACE, **kwargs)
        fonts = fonts or {}
        self.value = tk.Label(self, text=value, bg=theme.SURFACE, fg=theme.TEXT,
                              font=fonts.get("number", ("TkDefaultFont", 18, "bold")))
        self.value.pack(anchor="w")
        tk.Label(self, text=caption.upper(), bg=theme.SURFACE, fg=theme.MUTED,
                 font=fonts.get("small", ("TkDefaultFont", 8))).pack(anchor="w")

    def set(self, value: str, colour: Optional[str] = None) -> None:
        self.value.configure(text=value)
        if colour:
            self.value.configure(fg=colour)


class LogView(tk.Frame):
    """A capped, read-only scrollback."""

    def __init__(self, master: tk.Misc, fonts: Optional[dict] = None,
                 height: int = 8, limit: int = 400, **kwargs) -> None:
        super().__init__(master, bg=theme.SURFACE_HI, **kwargs)
        fonts = fonts or {}
        self.limit = limit
        self.text = tk.Text(self, height=height, bg=theme.SURFACE_HI,
                            fg=theme.MUTED, bd=0, highlightthickness=0,
                            font=fonts.get("mono", ("TkFixedFont", 9)),
                            wrap="word", padx=10, pady=8)
        scroll = ttk.Scrollbar(self, command=self.text.yview,
                               style="Vertical.TScrollbar")
        self.text.configure(yscrollcommand=scroll.set, state="disabled")
        self.text.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

    def append(self, line: str) -> None:
        self.text.configure(state="normal")
        self.text.insert("end", line.rstrip() + "\n")
        # Keep the buffer bounded: a long session should not grow without end.
        excess = int(self.text.index("end-1c").split(".")[0]) - self.limit
        if excess > 0:
            self.text.delete("1.0", "%d.0" % (excess + 1))
        self.text.see("end")
        self.text.configure(state="disabled")

    def clear(self) -> None:
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.configure(state="disabled")


def heading(master: tk.Misc, text: str, fonts: dict, sub: str = "") -> tk.Frame:
    """A screen title with an optional line of explanation under it."""
    wrap = tk.Frame(master, bg=theme.BG)
    tk.Label(wrap, text=text, bg=theme.BG, fg=theme.TEXT,
             font=fonts["title"]).pack(anchor="w")
    if sub:
        tk.Label(wrap, text=sub, bg=theme.BG, fg=theme.MUTED,
                 font=fonts["body"], justify="left").pack(anchor="w", pady=(4, 0))
    return wrap
