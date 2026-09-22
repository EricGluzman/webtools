"""Pure geometry helpers for the pilot.

Nothing in here touches the screen, the keyboard or any third-party library, so
it can be unit tested on any machine.  Screen coordinates follow the usual image
convention: x grows to the right, y grows *downwards*.
"""

from __future__ import annotations

import math
from typing import Iterable, Optional, Sequence, Tuple

Point = Tuple[float, float]


def clamp(value: float, low: float, high: float) -> float:
    """Constrain ``value`` to the inclusive range ``[low, high]``."""
    if low > high:
        low, high = high, low
    return max(low, min(high, value))


def lerp(a: float, b: float, t: float) -> float:
    """Linear blend between ``a`` and ``b``; ``t`` is not clamped."""
    return a + (b - a) * t


def distance(a: Point, b: Point) -> float:
    return math.hypot(b[0] - a[0], b[1] - a[1])


def sign(value: float, deadzone: float = 0.0) -> int:
    """-1, 0 or 1, treating anything inside ``deadzone`` as 0."""
    if value > deadzone:
        return 1
    if value < -deadzone:
        return -1
    return 0


def linear_fit(samples: Sequence[Tuple[float, float]]) -> Tuple[float, float]:
    """Least-squares fit of ``y = slope * x + intercept`` over ``samples``.

    A straight line through noisy detections is far steadier than differencing
    the last two frames, which is what the ball tracker needs to estimate speed.
    Returns ``(slope, intercept)``; a degenerate input gives a flat line.
    """
    n = len(samples)
    if n == 0:
        return 0.0, 0.0
    if n == 1:
        return 0.0, samples[0][1]

    mean_x = sum(s[0] for s in samples) / n
    mean_y = sum(s[1] for s in samples) / n
    numerator = sum((s[0] - mean_x) * (s[1] - mean_y) for s in samples)
    denominator = sum((s[0] - mean_x) ** 2 for s in samples)
    if denominator <= 1e-9:
        return 0.0, mean_y
    slope = numerator / denominator
    return slope, mean_y - slope * mean_x


def predict(position: Point, velocity: Point, dt: float) -> Point:
    """Where a point travelling at ``velocity`` lands after ``dt`` seconds."""
    return position[0] + velocity[0] * dt, position[1] + velocity[1] * dt


def intersect_x_at_y(
    position: Point, velocity: Point, target_y: float
) -> Optional[float]:
    """The x the point reaches when it crosses ``target_y``.

    ``None`` when it is not moving towards that line — a goalkeeper has nothing
    to commit to in that case.
    """
    vy = velocity[1]
    if abs(vy) < 1e-6:
        return None
    dt = (target_y - position[1]) / vy
    if dt < 0:
        return None
    return position[0] + velocity[0] * dt


def time_to_y(position: Point, velocity: Point, target_y: float) -> Optional[float]:
    """Seconds until the point crosses ``target_y``, or ``None`` if never."""
    vy = velocity[1]
    if abs(vy) < 1e-6:
        return None
    dt = (target_y - position[1]) / vy
    return dt if dt >= 0 else None


def time_to_radius(radius: float, growth: float, target: float) -> Optional[float]:
    """Seconds until an apparent radius grows from ``radius`` to ``target``.

    The ball's on-screen radius is the only depth cue a screen-reading bot gets:
    a ball swelling quickly is a ball coming at you.
    """
    if growth <= 1e-6:
        return None
    if radius >= target:
        return 0.0
    return (target - radius) / growth


def goal_line_anchor(
    ball: Point,
    post_left: Point,
    post_right: Point,
    depth: float = 0.16,
) -> Point:
    """Where a keeper should stand to cut the angle from ``ball`` to the goal.

    The textbook answer is "on the bisector of the angle the two posts make at
    the ball", stepped ``depth`` of the way off the line towards the ball.
    ``depth`` of 0 keeps the keeper glued to the line; 1 walks them onto the
    ball itself.
    """
    goal_centre = ((post_left[0] + post_right[0]) / 2.0,
                   (post_left[1] + post_right[1]) / 2.0)
    ratio = clamp(depth, 0.0, 1.0)
    anchor = (lerp(goal_centre[0], ball[0], ratio),
              lerp(goal_centre[1], ball[1], ratio))
    # Never stray outside the posts: an unguarded near post is the one mistake
    # a keeper cannot recover from.
    left, right = sorted((post_left[0], post_right[0]))
    return clamp(anchor[0], left, right), anchor[1]


def normalise(values: Iterable[float]) -> Tuple[float, ...]:
    """Scale a sequence so its largest magnitude is 1 (all-zero input passes)."""
    values = tuple(values)
    peak = max((abs(v) for v in values), default=0.0)
    if peak <= 1e-9:
        return values
    return tuple(v / peak for v in values)


class Frame:
    """The size of the image a detection's coordinates refer to.

    Positions are kept in raw pixels so the detector stays simple; every
    threshold a brain reasons with is a fraction of these, so one set of tuning
    numbers works at any resolution.
    """

    __slots__ = ("width", "height")

    def __init__(self, width: float, height: float) -> None:
        self.width = float(width)
        self.height = float(height)

    @property
    def diagonal(self) -> float:
        return math.hypot(self.width, self.height)

    def norm(self, x: float, y: float) -> Point:
        """Pixel coordinates as fractions of the frame."""
        return x / max(1.0, self.width), y / max(1.0, self.height)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "Frame(%g, %g)" % (self.width, self.height)
