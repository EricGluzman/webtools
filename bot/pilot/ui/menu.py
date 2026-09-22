"""The two picking screens: which game, then which role."""

from __future__ import annotations

import tkinter as tk
from typing import Callable

from ..games.registry import Game, all_games
from . import theme
from .widgets import Card, heading


class MenuScreen(tk.Frame):
    """Grid of games. Locked entries are visible but say so."""

    def __init__(self, master: tk.Misc, fonts: dict,
                 on_pick: Callable[[Game], None]) -> None:
        super().__init__(master, bg=theme.BG)
        self.fonts = fonts
        self.on_pick = on_pick
        self._build()

    def _build(self) -> None:
        heading(self, "Choose a game", self.fonts,
                "The pilot watches your screen and plays with the keyboard and "
                "mouse, the same way you would.").pack(
            anchor="w", padx=28, pady=(28, 20))

        grid = tk.Frame(self, bg=theme.BG)
        grid.pack(fill="both", expand=True, padx=28)
        grid.columnconfigure(0, weight=1, uniform="game")
        grid.columnconfigure(1, weight=1, uniform="game")

        games = all_games()
        for index, game in enumerate(games):
            self._game_card(grid, game).grid(
                row=index // 2, column=index % 2, sticky="nsew",
                padx=(0, 10) if index % 2 == 0 else (10, 0), pady=(0, 16))

        self._soon_card(grid).grid(
            row=len(games) // 2, column=len(games) % 2, sticky="nsew",
            padx=(0, 10) if len(games) % 2 == 0 else (10, 0), pady=(0, 16))

    def _game_card(self, master: tk.Misc, game: Game) -> Card:
        card = Card(master, accent=game.accent,
                    on_click=lambda: self.on_pick(game))
        body = card.inner

        tk.Label(body, text=game.subtitle.upper(), bg=theme.SURFACE,
                 fg=theme.MUTED, font=self.fonts["small"]).pack(anchor="w")
        tk.Label(body, text=game.name, bg=theme.SURFACE, fg=theme.TEXT,
                 font=self.fonts["heading"], wraplength=300,
                 justify="left").pack(anchor="w", pady=(2, 8))
        tk.Label(body, text=game.blurb, bg=theme.SURFACE, fg=theme.MUTED,
                 font=self.fonts["body"], wraplength=300,
                 justify="left").pack(anchor="w")

        ready = [r for r in game.roles if r.ready]
        tk.Label(body,
                 text="%d role%s ready  ·  %d planned"
                      % (len(ready), "" if len(ready) == 1 else "s",
                         len(game.roles) - len(ready)),
                 bg=theme.SURFACE, fg=game.accent,
                 font=self.fonts["small"]).pack(anchor="w", pady=(12, 0))
        card.bind_children()
        return card

    def _soon_card(self, master: tk.Misc) -> Card:
        card = Card(master)
        tk.Label(card.inner, text="MORE", bg=theme.SURFACE, fg=theme.MUTED,
                 font=self.fonts["small"]).pack(anchor="w")
        tk.Label(card.inner, text="Another game", bg=theme.SURFACE,
                 fg=theme.BORDER, font=self.fonts["heading"]).pack(
            anchor="w", pady=(2, 8))
        tk.Label(card.inner,
                 text="Each game is a folder under pilot/games with a brain "
                      "and a keymap. Copy the soccer one to start a new.",
                 bg=theme.SURFACE, fg=theme.BORDER, font=self.fonts["body"],
                 wraplength=300, justify="left").pack(anchor="w")
        return card


class RoleScreen(tk.Frame):
    """Roles inside one game."""

    def __init__(self, master: tk.Misc, fonts: dict, game: Game,
                 on_pick: Callable[[Game, object], None],
                 on_back: Callable[[], None]) -> None:
        super().__init__(master, bg=theme.BG)
        self.fonts = fonts
        self.game = game
        self.on_pick = on_pick
        self.on_back = on_back
        self._build()

    def _build(self) -> None:
        top = tk.Frame(self, bg=theme.BG)
        top.pack(fill="x", padx=28, pady=(24, 18))

        back = tk.Label(top, text="‹  All games", bg=theme.BG, fg=theme.MUTED,
                        font=self.fonts["body"], cursor="hand2")
        back.pack(anchor="w")
        back.bind("<Button-1>", lambda _e: self.on_back())

        tk.Label(top, text=self.game.name, bg=theme.BG, fg=theme.TEXT,
                 font=self.fonts["title"]).pack(anchor="w", pady=(10, 2))
        tk.Label(top, text="Pick what the bot should play as.", bg=theme.BG,
                 fg=theme.MUTED, font=self.fonts["body"]).pack(anchor="w")

        body = tk.Frame(self, bg=theme.BG)
        body.pack(fill="both", expand=True, padx=28)

        for role in self.game.roles:
            self._role_card(body, role).pack(fill="x", pady=(0, 12))

    def _role_card(self, master: tk.Misc, role) -> Card:
        handler = (lambda: self.on_pick(self.game, role)) if role.ready else None
        card = Card(master, on_click=handler,
                    accent=self.game.accent if role.ready else None)
        body = card.inner

        row = tk.Frame(body, bg=theme.SURFACE)
        row.pack(fill="x")
        tk.Label(row, text=role.name, bg=theme.SURFACE,
                 fg=theme.TEXT if role.ready else theme.MUTED,
                 font=self.fonts["heading"]).pack(side="left")
        tk.Label(row, text="READY" if role.ready else "NOT WRITTEN YET",
                 bg=theme.SURFACE,
                 fg=theme.GOOD if role.ready else theme.BORDER,
                 font=self.fonts["small"]).pack(side="right")

        tk.Label(body, text=role.blurb, bg=theme.SURFACE,
                 fg=theme.MUTED if role.ready else theme.BORDER,
                 font=self.fonts["body"], wraplength=620,
                 justify="left").pack(anchor="w", pady=(6, 0))
        card.bind_children()
        return card
