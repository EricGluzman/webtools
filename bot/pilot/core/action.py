"""The one thing a bot brain returns each tick.

Keeping the decision (this ``Action``) separate from the act of pressing keys
means a brain can be tested without a keyboard, and the runtime can drop every
held key the instant the operator hits the panic key.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Set, Tuple


@dataclass
class Action:
    """What to do for one frame.

    ``hold`` are logical names ("left", "sprint") held down until a later tick
    stops naming them; ``tap`` are one-shot presses; ``camera`` is a relative
    mouse nudge in pixels.
    """

    hold: Set[str] = field(default_factory=set)
    tap: List[str] = field(default_factory=list)
    camera: Tuple[float, float] = (0.0, 0.0)
    state: str = "idle"
    note: str = ""

    def press(self, *names: str) -> "Action":
        self.tap.extend(n for n in names if n not in self.tap)
        return self

    def keep(self, *names: str) -> "Action":
        self.hold.update(names)
        return self

    def look(self, dx: float, dy: float = 0.0) -> "Action":
        self.camera = (dx, dy)
        return self

    def because(self, note: str) -> "Action":
        self.note = note
        return self

    def describe(self) -> str:
        bits = []
        if self.hold:
            bits.append("hold " + "+".join(sorted(self.hold)))
        if self.tap:
            bits.append("tap " + "+".join(self.tap))
        if abs(self.camera[0]) > 0.5 or abs(self.camera[1]) > 0.5:
            bits.append("look %+d" % int(self.camera[0]))
        return ", ".join(bits) or "still"
