"""Finding the match ball in a frame.

There is no model here and nothing to train: the ball is a small, bright,
round, *moving* thing, and each of those four words is a filter.  Candidates
are scored rather than accepted or rejected outright, so a ball crossing a
white kit degrades to a slightly worse score instead of vanishing.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np


@dataclass(frozen=True)
class Detection:
    x: float
    y: float
    radius: float
    score: float
    circularity: float
    moved: bool


def _as_uint8(values: Any, fallback: Tuple[int, int, int]) -> np.ndarray:
    try:
        arr = np.array([int(v) for v in values][:3], dtype=np.uint8)
        if arr.size == 3:
            return arr
    except (TypeError, ValueError):
        pass
    return np.array(fallback, dtype=np.uint8)


class BallDetector:
    """Colour + shape + motion search for the ball, tuned by config."""

    def __init__(self, settings: Dict[str, Any] | None = None) -> None:
        self.settings: Dict[str, Any] = dict(settings or {})
        self._previous_gray: Optional[np.ndarray] = None
        self._kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))

    def configure(self, settings: Dict[str, Any]) -> None:
        self.settings.update(settings or {})

    def _f(self, key: str, fallback: float) -> float:
        try:
            return float(self.settings.get(key, fallback))
        except (TypeError, ValueError):
            return fallback

    # ------------------------------------------------------------------ masks

    def _colour_mask(self, frame_bgr: np.ndarray) -> np.ndarray:
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        low = _as_uint8(self.settings.get("hsv_low"), (0, 0, 168))
        high = _as_uint8(self.settings.get("hsv_high"), (180, 74, 255))

        if low[0] <= high[0]:
            mask = cv2.inRange(hsv, low, high)
        else:
            # Hue wraps at 180 (red): search both ends and merge.
            lo_a = np.array([low[0], low[1], low[2]], dtype=np.uint8)
            hi_a = np.array([179, high[1], high[2]], dtype=np.uint8)
            lo_b = np.array([0, low[1], low[2]], dtype=np.uint8)
            hi_b = np.array([high[0], high[1], high[2]], dtype=np.uint8)
            mask = cv2.bitwise_or(cv2.inRange(hsv, lo_a, hi_a),
                                  cv2.inRange(hsv, lo_b, hi_b))

        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, self._kernel)
        return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self._kernel)

    def _motion_mask(self, frame_bgr: np.ndarray) -> Optional[np.ndarray]:
        """Pixels that changed since the last frame.

        A ball in play is almost always the fastest thing on screen, which
        separates it from the white paint on the pitch and the goal net.
        """
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        previous, self._previous_gray = self._previous_gray, gray
        if previous is None or previous.shape != gray.shape:
            return None
        delta = cv2.absdiff(previous, gray)
        _, motion = cv2.threshold(delta, 18, 255, cv2.THRESH_BINARY)
        return cv2.dilate(motion, self._kernel, iterations=2)

    def _roi_bounds(self, height: int) -> Tuple[int, int]:
        top = int(self._f("roi_top", 0.05) * height)
        bottom = int(self._f("roi_bottom", 0.97) * height)
        top = max(0, min(top, height - 1))
        bottom = max(top + 1, min(bottom, height))
        return top, bottom

    # ------------------------------------------------------------- candidates

    def candidates(self, frame_bgr: np.ndarray,
                   hint: Optional[Tuple[float, float]] = None) -> List[Detection]:
        """Every plausible ball in the frame, best score first."""
        if frame_bgr is None or frame_bgr.size == 0:
            return []

        height, width = frame_bgr.shape[:2]
        top, bottom = self._roi_bounds(height)
        mask = self._colour_mask(frame_bgr)
        mask[:top, :] = 0
        mask[bottom:, :] = 0

        motion = self._motion_mask(frame_bgr) if self.settings.get(
            "motion_assist", True) else None

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        min_radius = self._f("min_radius", 3.0)
        max_radius = self._f("max_radius", 90.0)
        min_circularity = self._f("min_circularity", 0.55)
        min_fill = self._f("min_fill", 0.55)
        diagonal = (width ** 2 + height ** 2) ** 0.5

        found: List[Detection] = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 4.0:
                continue
            perimeter = cv2.arcLength(contour, True)
            if perimeter <= 1e-6:
                continue

            circularity = 4.0 * np.pi * area / (perimeter ** 2)
            if circularity < min_circularity:
                continue

            (cx, cy), radius = cv2.minEnclosingCircle(contour)
            if radius < min_radius or radius > max_radius:
                continue

            # How much of the circle the blob actually fills: a ball fills it,
            # a stray arc of line marking does not.
            fill = area / max(1e-6, np.pi * radius * radius)
            if fill < min_fill:
                continue

            moved = False
            if motion is not None:
                y0 = max(0, int(cy - radius))
                y1 = min(height, int(cy + radius) + 1)
                x0 = max(0, int(cx - radius))
                x1 = min(width, int(cx + radius) + 1)
                patch = motion[y0:y1, x0:x1]
                moved = bool(patch.size and patch.mean() > 12.0)

            score = 0.55 * circularity + 0.25 * fill
            if moved:
                score += 0.30
            if hint is not None:
                # Prefer the candidate nearest where the ball was last frame.
                gap = ((cx - hint[0]) ** 2 + (cy - hint[1]) ** 2) ** 0.5
                score += 0.35 * max(0.0, 1.0 - gap / (diagonal * 0.25))
            # Very large blobs are usually a wall or a kit, not the ball.
            score -= 0.20 * max(0.0, (radius - max_radius * 0.6) / max_radius)

            found.append(Detection(float(cx), float(cy), float(radius),
                                   float(score), float(circularity), moved))

        found.sort(key=lambda d: d.score, reverse=True)
        return found

    def detect(self, frame_bgr: np.ndarray,
               hint: Optional[Tuple[float, float]] = None) -> Optional[Detection]:
        """The single best candidate, or ``None`` if the frame has nothing."""
        results = self.candidates(frame_bgr, hint)
        return results[0] if results else None

    # ------------------------------------------------------------ calibration

    @staticmethod
    def sample_profile(frame_bgr: np.ndarray, x: int, y: int,
                       patch: int = 6) -> Dict[str, Any]:
        """Build HSV bounds from a patch the operator clicked on.

        Used by the calibration screen: point at the ball, get a colour profile
        that fits this map's lighting rather than the shipped guess.
        """
        if frame_bgr is None or frame_bgr.size == 0:
            return {}
        height, width = frame_bgr.shape[:2]
        # A click outside the frame must return nothing: negative slice bounds
        # would otherwise wrap around and sample the far side of the image.
        if not (0 <= x < width and 0 <= y < height):
            return {}
        x0, x1 = max(0, x - patch), min(width, x + patch + 1)
        y0, y1 = max(0, y - patch), min(height, y + patch + 1)
        region = frame_bgr[y0:y1, x0:x1]
        if region.size == 0:
            return {}

        hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV).reshape(-1, 3)
        median = np.median(hsv, axis=0)
        spread = np.maximum(np.std(hsv, axis=0) * 2.5, [8, 40, 40])

        low = np.clip(median - spread, [0, 0, 0], [179, 255, 255]).astype(int)
        high = np.clip(median + spread, [0, 0, 0], [179, 255, 255]).astype(int)
        return {"hsv_low": low.tolist(), "hsv_high": high.tolist()}
