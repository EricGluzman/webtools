"""Screen capture.

The pilot never reads the game's memory or files — it looks at the same pixels
you do.  Frames come back as BGR numpy arrays, already shrunk to the analysis
width so the rest of the pipeline has less to chew through.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple

import numpy as np

try:  # pragma: no cover - depends on the machine, not the logic
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore

try:  # pragma: no cover
    import mss
except ImportError:  # pragma: no cover
    mss = None  # type: ignore


class CaptureError(RuntimeError):
    """Raised when the screen cannot be read at all."""


@dataclass(frozen=True)
class Grab:
    """One captured frame plus what it took to get there."""

    image: np.ndarray          # BGR, analysis-sized
    scale: float               # analysis pixels per screen pixel
    origin: Tuple[int, int]    # top-left of the captured area, in screen pixels

    @property
    def size(self) -> Tuple[int, int]:
        height, width = self.image.shape[:2]
        return width, height

    def to_screen(self, x: float, y: float) -> Tuple[int, int]:
        """Map a point in the analysed frame back to absolute screen pixels."""
        if self.scale <= 0:
            return int(x) + self.origin[0], int(y) + self.origin[1]
        return (int(x / self.scale) + self.origin[0],
                int(y / self.scale) + self.origin[1])


class ScreenCapture:
    """A reusable grabber bound to one monitor or one rectangle of it."""

    def __init__(self, settings: Dict[str, Any] | None = None) -> None:
        self.settings: Dict[str, Any] = dict(settings or {})
        self._sct: Any = None

    def configure(self, settings: Dict[str, Any]) -> None:
        self.settings.update(settings or {})

    @staticmethod
    def available() -> bool:
        return mss is not None and cv2 is not None

    def monitors(self) -> List[Dict[str, int]]:
        """Every monitor mss can see; index 0 is the virtual full desktop."""
        if mss is None:
            return []
        with mss.mss() as sct:
            return [dict(m) for m in sct.monitors]

    def _open(self) -> Any:
        if mss is None:
            raise CaptureError(
                "mss is not installed - run: pip install -r requirements.txt")
        if self._sct is None:
            self._sct = mss.mss()
        return self._sct

    def close(self) -> None:
        if self._sct is not None:
            try:
                self._sct.close()
            except Exception:
                pass
            self._sct = None

    def _area(self) -> Dict[str, int]:
        """The rectangle to grab: a custom region, or the whole monitor."""
        sct = self._open()
        index = int(self.settings.get("monitor", 1) or 1)
        monitors = sct.monitors
        if index < 0 or index >= len(monitors):
            index = 1 if len(monitors) > 1 else 0
        monitor = monitors[index]

        region = self.settings.get("region")
        if isinstance(region, (list, tuple)) and len(region) == 4:
            try:
                x, y, w, h = (int(v) for v in region)
                if w > 0 and h > 0:
                    return {"left": x, "top": y, "width": w, "height": h}
            except (TypeError, ValueError):
                pass
        return {"left": monitor["left"], "top": monitor["top"],
                "width": monitor["width"], "height": monitor["height"]}

    def grab(self) -> Grab:
        """Take one frame."""
        if cv2 is None:
            raise CaptureError(
                "opencv is not installed - run: pip install -r requirements.txt")
        area = self._area()
        sct = self._open()
        raw = sct.grab(area)
        frame = np.asarray(raw, dtype=np.uint8)[:, :, :3]  # BGRA -> BGR

        target = int(self.settings.get("analysis_width", 640) or 640)
        height, width = frame.shape[:2]
        scale = 1.0
        if target > 0 and width > target:
            scale = target / float(width)
            frame = cv2.resize(frame, (target, max(1, int(height * scale))),
                               interpolation=cv2.INTER_AREA)
        return Grab(frame, scale, (area["left"], area["top"]))
