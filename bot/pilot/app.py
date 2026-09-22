"""The launcher window: one Tk root, one screen visible at a time."""

from __future__ import annotations

import sys
import tkinter as tk
from typing import Any, Optional

from .core.config import Config
from .games.registry import Game, find
from .ui import theme
from .ui.menu import MenuScreen, RoleScreen
from .ui.panel import BotPanel
from .ui.settings import SettingsScreen

APP_TITLE = "Roblox Pilot"
MIN_SIZE = (940, 700)


class PilotApp:
    """Owns the window, the config and whichever screen is showing."""

    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title(APP_TITLE)
        self.root.geometry("%dx%d" % MIN_SIZE)
        self.root.minsize(*MIN_SIZE)
        self.root.configure(bg=theme.BG)

        self.fonts = theme.apply(self.root)
        self.config = Config.load()
        self.current: Optional[tk.Frame] = None
        self._game: Optional[Game] = None
        self._role: Optional[Any] = None

        self.container = tk.Frame(self.root, bg=theme.BG)
        self.container.pack(fill="both", expand=True)

        self.root.protocol("WM_DELETE_WINDOW", self._quit)
        self.show_menu()

    # ---------------------------------------------------------------- screens

    def _swap(self, screen: tk.Frame) -> None:
        previous, self.current = self.current, screen
        screen.pack(fill="both", expand=True)
        if previous is not None:
            previous.destroy()

    def show_menu(self) -> None:
        self._swap(MenuScreen(self.container, self.fonts, self.show_roles))

    def show_roles(self, game: Game) -> None:
        self._game = game
        self._swap(RoleScreen(self.container, self.fonts, game,
                              self.show_panel, self.show_menu))

    def show_panel(self, game: Game, role: Any) -> None:
        self._game, self._role = game, role
        self._swap(BotPanel(self.container, self.fonts, self.config, game, role,
                            on_back=lambda: self.show_roles(game),
                            on_settings=self.show_settings))

    def show_settings(self) -> None:
        if not (self._game and self._role):
            self.show_menu()
            return
        game, role = self._game, self._role
        self._swap(SettingsScreen(self.container, self.fonts, self.config,
                                  game, role,
                                  on_back=lambda: self.show_panel(game, role)))

    # ------------------------------------------------------------------- life

    def _quit(self) -> None:
        # Screens stop their own bot loop and release held keys on destroy.
        if self.current is not None:
            try:
                self.current.destroy()
            except tk.TclError:
                pass
        try:
            self.config.save()
        except Exception:
            pass
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def main(argv: Optional[list] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)

    try:
        app = PilotApp()
    except tk.TclError as exc:
        print("Could not open a window: %s" % exc, file=sys.stderr)
        print("On Linux install python3-tk; over SSH you need a display.",
              file=sys.stderr)
        return 2

    if "--game" in argv:
        try:
            game_key = argv[argv.index("--game") + 1]
            game = find(game_key)
            role_key = argv[argv.index("--role") + 1] if "--role" in argv else None
            if game:
                role = game.role(role_key) if role_key else next(
                    (r for r in game.roles if r.ready), None)
                if role and role.ready:
                    app.show_panel(game, role)
                else:
                    app.show_roles(game)
        except (IndexError, ValueError):
            pass

    app.run()
    return 0
