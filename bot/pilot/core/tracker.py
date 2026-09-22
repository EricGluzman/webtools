"""Turns a stream of per-frame ball sightings into something worth acting on.

A single detection is a guess: it jitters, it drops out for a frame or two, and
it occasionally latches onto a white shirt instead of the ball.  The tracker
smooths that into a position, a velocity and — the important one for a keeper —
how fast the ball is swelling on screen, which is the only depth cue available
to a bot that can see nothing but pixels.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Deque, Optional, Tuple

from .geometry import clamp, intersect_x_at_y, linear_fit, predict, time_to_y

Point = Tuple[float, float]


@dataclass(frozen=True)
class Sighting:
    """One frame's worth of "I think the ball is here"."""

    t: float
    x: float
    y: float
    radius: float
    confidence: float = 1.0


@dataclass
class BallState:
    """The tracker's current best belief about the ball."""

    position: Point
    velocity: Point
    radius: float
    growth: float          # pixels of radius gained per second
    confidence: float
    age: float             # seconds since the last accepted sighting
    samples: int

    @property
    def speed(self) -> float:
        return (self.velocity[0] ** 2 + self.velocity[1] ** 2) ** 0.5

    @property
    def visible(self) -> bool:
        return self.age <= 0.35 and self.confidence > 0.0

    def predict(self, dt: float) -> Point:
        return predict(self.position, self.velocity, dt)

    def crossing_x(self, line_y: float) -> Optional[float]:
        return intersect_x_at_y(self.position, self.velocity, line_y)

    def time_to_line(self, line_y: float) -> Optional[float]:
        return time_to_y(self.position, self.velocity, line_y)


class BallTracker:
    """Keeps a short history of sightings and fits motion through it.

    ``window`` is how many frames the fit looks back over — long enough to ride
    out jitter, short enough that a deflection is picked up within a few frames.
    """

    def __init__(self, window: int = 8, max_gap: float = 0.6,
                 smoothing: float = 0.55, max_jump: float = 0.45) -> None:
        self.window = max(2, window)
        self.max_gap = max_gap
        self.smoothing = clamp(smoothing, 0.0, 1.0)
        self.max_jump = max_jump
        self._history: Deque[Sighting] = deque(maxlen=self.window)
        self._smoothed: Optional[Point] = None
        self._smoothed_radius: float = 0.0
        self._last_t: float = 0.0
        self._frame_diagonal: float = 1000.0

    def set_frame_size(self, width: float, height: float) -> None:
        """Tell the tracker how big a frame is, so jump limits scale with it."""
        self._frame_diagonal = max(1.0, (width ** 2 + height ** 2) ** 0.5)

    def reset(self) -> None:
        self._history.clear()
        self._smoothed = None
        self._smoothed_radius = 0.0
        self._last_t = 0.0

    def _is_teleport(self, sighting: Sighting) -> bool:
        """Reject a sighting that moved further than a ball plausibly could.

        Guards against the detector jumping to a white kit on the far side of
        the pitch.  A long gap since the last sighting forgives a big jump —
        the ball really could have travelled in that time.
        """
        if self._smoothed is None:
            return False
        gap = max(1e-3, sighting.t - self._last_t)
        if gap > self.max_gap:
            return False
        travelled = ((sighting.x - self._smoothed[0]) ** 2
                     + (sighting.y - self._smoothed[1]) ** 2) ** 0.5
        budget = self.max_jump * self._frame_diagonal * min(gap, 0.25) / 0.25
        return travelled > budget

    def update(self, sighting: Optional[Sighting], now: float) -> BallState:
        """Feed one frame in and get the current belief out.

        ``sighting`` is ``None`` for a frame where nothing was found; the
        tracker coasts on its last velocity so a one-frame dropout does not
        make the keeper freeze.
        """
        if sighting is not None:
            if self._history and self._is_teleport(sighting):
                # Treat it as a miss, but forget history if it keeps happening
                # so the tracker can re-latch onto a genuinely new position.
                if sighting.t - self._last_t > self.max_gap:
                    self.reset()
                else:
                    sighting = None

        if sighting is not None:
            if self._smoothed is None:
                self._smoothed = (sighting.x, sighting.y)
                self._smoothed_radius = sighting.radius
            else:
                k = self.smoothing
                self._smoothed = (
                    self._smoothed[0] + (sighting.x - self._smoothed[0]) * k,
                    self._smoothed[1] + (sighting.y - self._smoothed[1]) * k,
                )
                self._smoothed_radius += (
                    sighting.radius - self._smoothed_radius) * k
            self._history.append(Sighting(sighting.t, self._smoothed[0],
                                          self._smoothed[1],
                                          self._smoothed_radius,
                                          sighting.confidence))
            self._last_t = sighting.t

        if not self._history or self._smoothed is None:
            return BallState((0.0, 0.0), (0.0, 0.0), 0.0, 0.0, 0.0, 999.0, 0)

        age = max(0.0, now - self._last_t)
        if age > self.max_gap:
            self.reset()
            return BallState((0.0, 0.0), (0.0, 0.0), 0.0, 0.0, 0.0, 999.0, 0)

        vx, _ = linear_fit([(s.t, s.x) for s in self._history])
        vy, _ = linear_fit([(s.t, s.y) for s in self._history])
        growth, _ = linear_fit([(s.t, s.radius) for s in self._history])

        # Coast forward over the gap since the last sighting so a dropped frame
        # does not read as a stationary ball.
        position = predict(self._smoothed, (vx, vy), age)
        confidence = self._history[-1].confidence * max(0.0, 1.0 - age / self.max_gap)

        return BallState(
            position=position,
            velocity=(vx, vy),
            radius=self._smoothed_radius + growth * age,
            growth=growth,
            confidence=clamp(confidence, 0.0, 1.0),
            age=age,
            samples=len(self._history),
        )
