"""What the launcher menu offers.

Each game lists the roles it can play.  A role knows how to build its own brain
and detector, so adding a striker later means adding an entry here and a brain
module — the UI and the runtime need no changes at all.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional

from ..core.config import Config


@dataclass(frozen=True)
class Role:
    """One way to play a game."""

    key: str
    name: str
    blurb: str
    ready: bool = True
    build: Optional[Callable[[Config], Any]] = None
    detector: Optional[Callable[[Config], Any]] = None


@dataclass(frozen=True)
class Game:
    """A game the pilot knows how to look at."""

    key: str
    name: str
    subtitle: str
    blurb: str
    accent: str
    roles: List[Role] = field(default_factory=list)
    ready: bool = True

    def role(self, key: str) -> Optional[Role]:
        for role in self.roles:
            if role.key == key:
                return role
        return None


def _illegal_soccer_keeper(config: Config):
    from .illegal_soccer.goalkeeper import Goalkeeper
    return Goalkeeper(config.section("games.illegal_soccer.goalkeeper"))


def _illegal_soccer_detector(config: Config):
    from ..vision.ball import BallDetector
    return BallDetector(config.section("games.illegal_soccer.vision"))


ILLEGAL_SOCCER = Game(
    key="illegal_soccer",
    name="[RANKED!] Illegal Soccer",
    subtitle="Roblox",
    blurb="Watches the pitch and keeps goal: holds the line, comes for "
          "crosses and dives at the shot.",
    accent="#38bdf8",
    roles=[
        Role(
            key="goalkeeper",
            name="Goalkeeper",
            blurb="Shadows the ball across the goal, punches what it can reach "
                  "and dives at what it cannot.",
            ready=True,
            build=_illegal_soccer_keeper,
            detector=_illegal_soccer_detector,
        ),
        Role(
            key="striker",
            name="Striker",
            blurb="Runs the channels and shoots. Not written yet.",
            ready=False,
        ),
        Role(
            key="defender",
            name="Defender",
            blurb="Marks, tackles and clears. Not written yet.",
            ready=False,
        ),
    ],
)


GAMES: List[Game] = [ILLEGAL_SOCCER]


def all_games() -> List[Game]:
    return list(GAMES)


def find(key: str) -> Optional[Game]:
    for game in GAMES:
        if game.key == key:
            return game
    return None
