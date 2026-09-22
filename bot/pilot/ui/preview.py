"""The "what the bot sees" pane.

Tk cannot display a numpy array, and pulling in Pillow just to show a preview
is a heavy dependency for a nicety.  Tk *can* read a base64 PPM, though, and
encoding one is a header plus the raw bytes — so that is what this does.  The
overlay (ball, posts, keeper line) is drawn as canvas items on top, which keeps
the image itself untouched.
"""

from __future__ import annotations

import base64
import tkinter as tk
from typing import Any, Dict, Optional

from . import theme

try:  # pragma: no cover - the preview degrades without numpy
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore

try:  # pragma: no cover
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore


def frame_to_photo(frame_bgr: Any, width: int) -> Optional[tk.PhotoImage]:
    """Shrink a BGR frame to ``width`` and wrap it as a Tk image."""
    if np is None or frame_bgr is None or getattr(frame_bgr, "size", 0) == 0:
        return None
    height, source_width = frame_bgr.shape[:2]
    if source_width <= 0 or height <= 0:
        return None

    target_width = max(64, int(width))
    target_height = max(36, int(height * target_width / source_width))

    if cv2 is not None:
        resized = cv2.resize(frame_bgr, (target_width, target_height),
                             interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    else:  # nearest-neighbour fallback, no OpenCV needed
        ys = (np.arange(target_height) * height // target_height).clip(0, height - 1)
        xs = (np.arange(target_width) * source_width // target_width).clip(
            0, source_width - 1)
        rgb = frame_bgr[ys][:, xs][:, :, ::-1]

    payload = b"P6\n%d %d\n255\n" % (target_width, target_height) + \
        np.ascontiguousarray(rgb, dtype=np.uint8).tobytes()
    try:
        return tk.PhotoImage(data=base64.b64encode(payload))
    except tk.TclError:  # pragma: no cover - very old Tk
        return None


class PreviewCanvas(tk.Canvas):
    """Shows the captured frame with the keeper's reference lines drawn on it."""

    def __init__(self, master: tk.Misc, width: int = 420, height: int = 236,
                 **kwargs) -> None:
        super().__init__(master, width=width, height=height, bg=theme.SURFACE_HI,
                         highlightthickness=0, bd=0, **kwargs)
        self._photo: Optional[tk.PhotoImage] = None
        self._placeholder = self.create_text(
            width // 2, height // 2, text="no signal",
            fill=theme.MUTED, font=("TkDefaultFont", 10))

    def clear(self) -> None:
        self.delete("overlay")
        self.delete("frame")
        self._photo = None
        self.itemconfigure(self._placeholder, state="normal")

    def render(self, frame_bgr: Any, ball: Any = None,
               tuning: Optional[Dict[str, Any]] = None) -> None:
        """Draw one frame plus the overlay. Safe to call from the UI thread only."""
        width = max(120, int(self.winfo_width() or self.cget("width")))
        photo = frame_to_photo(frame_bgr, width)
        if photo is None:
            self.clear()
            return

        self.itemconfigure(self._placeholder, state="hidden")
        self.delete("frame")
        self.delete("overlay")
        # Keep a reference: Tk does not own the image and will blank it otherwise.
        self._photo = photo
        self.configure(height=photo.height())
        self.create_image(0, 0, image=photo, anchor="nw", tags="frame")

        scale_x = photo.width() / max(1.0, float(frame_bgr.shape[1]))
        scale_y = photo.height() / max(1.0, float(frame_bgr.shape[0]))
        self._draw_overlay(photo, ball, tuning or {}, scale_x, scale_y)

    def _draw_overlay(self, photo: tk.PhotoImage, ball: Any,
                      tuning: Dict[str, Any], scale_x: float,
                      scale_y: float) -> None:
        width, height = photo.width(), photo.height()

        def number(key: str, fallback: float) -> float:
            try:
                return float(tuning.get(key, fallback))
            except (TypeError, ValueError):
                return fallback

        # The posts and the line the keeper measures everything against.
        post_l = number("post_left", 0.20) * width
        post_r = number("post_right", 0.80) * width
        line_y = number("goal_line_y", 0.88) * height
        home_x = number("home_x", 0.5) * width

        self.create_line(post_l, line_y - 26, post_l, line_y + 6,
                         fill=theme.BORDER, width=2, tags="overlay")
        self.create_line(post_r, line_y - 26, post_r, line_y + 6,
                         fill=theme.BORDER, width=2, tags="overlay")
        self.create_line(post_l, line_y, post_r, line_y,
                         fill=theme.BORDER, width=1, dash=(4, 3), tags="overlay")
        self.create_line(home_x, line_y - 14, home_x, line_y + 14,
                         fill=theme.ACCENT_DIM, width=2, tags="overlay")

        if ball is None or not getattr(ball, "visible", False):
            self.create_text(8, 8, text="ball: lost", anchor="nw",
                             fill=theme.WARN, font=("TkDefaultFont", 8),
                             tags="overlay")
            return

        bx = ball.position[0] * scale_x
        by = ball.position[1] * scale_y
        radius = max(4.0, ball.radius * scale_x)
        self.create_oval(bx - radius, by - radius, bx + radius, by + radius,
                         outline=theme.ACCENT, width=2, tags="overlay")
        self.create_line(bx - radius - 6, by, bx + radius + 6, by,
                         fill=theme.ACCENT, width=1, tags="overlay")

        # A short vector showing where it is heading over the next fifth of a second.
        ahead = ball.predict(0.2)
        self.create_line(bx, by, ahead[0] * scale_x, ahead[1] * scale_y,
                         fill=theme.BAD, width=2, arrow="last", tags="overlay")

        self.create_text(8, 8, anchor="nw", fill=theme.GOOD,
                         font=("TkDefaultFont", 8), tags="overlay",
                         text="ball r=%.0f  v=%.0f  grow=%+.0f"
                              % (ball.radius, ball.speed, ball.growth))
