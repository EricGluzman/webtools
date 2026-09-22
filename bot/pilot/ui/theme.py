"""Colours, fonts and the ttk styling shared by every screen."""

from __future__ import annotations

import tkinter as tk
from tkinter import font as tkfont
from tkinter import ttk

BG = "#0f1115"
SURFACE = "#171a21"
SURFACE_HI = "#1e222b"
BORDER = "#2a2f3a"
TEXT = "#e6e9ef"
MUTED = "#8b93a7"
ACCENT = "#38bdf8"
ACCENT_DIM = "#0e7490"
GOOD = "#4ade80"
WARN = "#fbbf24"
BAD = "#f87171"

STATE_COLOURS = {
    "idle": MUTED,
    "search": WARN,
    "hold line": ACCENT,
    "set": ACCENT,
    "claim": WARN,
    "dive": BAD,
    "punch": BAD,
    "recover": MUTED,
    "distribute": GOOD,
    "paused": WARN,
    "stopped": MUTED,
}


def pick_family(root: tk.Misc) -> str:
    """The nicest UI font actually installed on this machine."""
    available = set(tkfont.families(root))
    for candidate in ("Segoe UI", "Inter", "SF Pro Text", "Helvetica Neue",
                      "DejaVu Sans", "Noto Sans", "Arial"):
        if candidate in available:
            return candidate
    return "TkDefaultFont"


def mono_family(root: tk.Misc) -> str:
    available = set(tkfont.families(root))
    for candidate in ("Cascadia Mono", "Consolas", "JetBrains Mono",
                      "SF Mono", "DejaVu Sans Mono", "Menlo", "Courier New"):
        if candidate in available:
            return candidate
    return "TkFixedFont"


def apply(root: tk.Misc) -> dict:
    """Style ttk to match, and hand back the font names the screens use."""
    family = pick_family(root)
    mono = mono_family(root)
    fonts = {
        "title": (family, 20, "bold"),
        "heading": (family, 14, "bold"),
        "body": (family, 11),
        "small": (family, 9),
        "button": (family, 11, "bold"),
        "mono": (mono, 9),
        "number": (family, 22, "bold"),
    }

    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except tk.TclError:  # pragma: no cover - ancient Tk
        pass

    style.configure(".", background=BG, foreground=TEXT, fieldbackground=SURFACE_HI,
                    bordercolor=BORDER, font=fonts["body"])
    style.configure("TFrame", background=BG)
    style.configure("Card.TFrame", background=SURFACE)
    style.configure("Inset.TFrame", background=SURFACE_HI)
    style.configure("TLabel", background=BG, foreground=TEXT, font=fonts["body"])
    style.configure("Card.TLabel", background=SURFACE, foreground=TEXT)
    style.configure("Muted.TLabel", background=BG, foreground=MUTED,
                    font=fonts["small"])
    style.configure("CardMuted.TLabel", background=SURFACE, foreground=MUTED,
                    font=fonts["small"])
    style.configure("Title.TLabel", background=BG, foreground=TEXT,
                    font=fonts["title"])
    style.configure("Heading.TLabel", background=SURFACE, foreground=TEXT,
                    font=fonts["heading"])

    style.configure("TButton", background=SURFACE_HI, foreground=TEXT,
                    borderwidth=0, focusthickness=0, padding=(14, 9),
                    font=fonts["button"])
    style.map("TButton",
              background=[("active", BORDER), ("disabled", SURFACE)],
              foreground=[("disabled", MUTED)])

    style.configure("Accent.TButton", background=ACCENT, foreground="#06212e")
    style.map("Accent.TButton",
              background=[("active", "#7dd3fc"), ("disabled", BORDER)],
              foreground=[("disabled", MUTED)])

    style.configure("Danger.TButton", background="#7f1d1d", foreground="#fee2e2")
    style.map("Danger.TButton", background=[("active", "#991b1b")])

    style.configure("Ghost.TButton", background=BG, foreground=MUTED,
                    padding=(10, 6))
    style.map("Ghost.TButton", background=[("active", SURFACE_HI)],
              foreground=[("active", TEXT)])

    style.configure("TEntry", fieldbackground=SURFACE_HI, foreground=TEXT,
                    insertcolor=TEXT, borderwidth=0, padding=6)
    style.configure("TCombobox", fieldbackground=SURFACE_HI, foreground=TEXT,
                    arrowcolor=MUTED, borderwidth=0, padding=5)
    style.configure("TCheckbutton", background=SURFACE, foreground=TEXT)
    style.map("TCheckbutton", background=[("active", SURFACE)])
    style.configure("TScale", background=SURFACE, troughcolor=SURFACE_HI)
    style.configure("Vertical.TScrollbar", background=SURFACE_HI,
                    troughcolor=BG, bordercolor=BG, arrowcolor=MUTED)
    style.configure("TNotebook", background=BG, borderwidth=0)
    style.configure("TNotebook.Tab", background=BG, foreground=MUTED,
                    padding=(16, 9), font=fonts["body"], borderwidth=0)
    style.map("TNotebook.Tab",
              background=[("selected", SURFACE)],
              foreground=[("selected", TEXT)])
    return fonts


def state_colour(state: str) -> str:
    return STATE_COLOURS.get((state or "").lower(), ACCENT)
