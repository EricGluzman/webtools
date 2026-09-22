"""The goalkeeper brain for [RANKED!] Illegal Soccer.

It sees one thing — where the ball is on screen and how fast it is swelling —
and keeps a keeper's priorities in that order:

1. never be beaten at the near post, so shadow the ball along the line;
2. commit late, because a keeper who dives early is a keeper who is lobbed;
3. come and claim anything loose inside the six-yard box;
4. get rid of it quickly once it is held.

Every number it reasons with is a fraction of the frame, so the same tuning
works at 1080p and 1440p.  The brain is pure: it takes a ball state and the
clock, and returns an :class:`Action`.  No pixels, no keypresses, no threads.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from ...core.action import Action
from ...core.geometry import Frame, clamp, sign
from ...core.tracker import BallState

# Named states, so the panel and the logs agree on what the keeper is doing.
IDLE = "idle"
SEARCH = "search"
HOLD_LINE = "hold line"
SET = "set"
CLAIM = "claim"
DIVE = "dive"
PUNCH = "punch"
RECOVER = "recover"
DISTRIBUTE = "distribute"


class Goalkeeper:
    """A stateful keeper; call :meth:`decide` once per captured frame."""

    def __init__(self, tuning: Dict[str, Any]) -> None:
        self.t = dict(tuning)
        self.state = IDLE
        self.state_since = 0.0
        self.last_dive = -99.0
        self.last_punch = -99.0
        self.last_distribute = -99.0
        self.last_seen = -99.0
        self.dive_direction = 0
        self.sweep_direction = 1
        self._holding_since: Optional[float] = None

    # ---------------------------------------------------------------- helpers

    def _num(self, key: str, fallback: float) -> float:
        value = self.t.get(key, fallback)
        try:
            return float(value)
        except (TypeError, ValueError):
            return fallback

    def _enter(self, state: str, now: float) -> None:
        if state != self.state:
            self.state = state
            self.state_since = now

    def _elapsed(self, now: float) -> float:
        return now - self.state_since

    def reset(self) -> None:
        """Forget everything — used when the operator restarts the bot."""
        self.state = IDLE
        self.state_since = 0.0
        self.last_dive = self.last_punch = self.last_distribute = -99.0
        self.last_seen = -99.0
        self.dive_direction = 0
        self._holding_since = None

    # ------------------------------------------------------------- perception

    def _impact_time(self, ball: BallState, frame: Frame) -> Optional[float]:
        """Best guess at how long until the ball arrives, in seconds.

        Two independent estimates: how long until it swells to claiming size,
        and how long until it crosses the keeper's line on screen.  The sooner
        of the two is the one worth reacting to.
        """
        estimates = []

        claim_radius = self._num("claim_radius", 46.0)
        if ball.growth > 1e-6 and ball.radius < claim_radius:
            estimates.append((claim_radius - ball.radius) / ball.growth)
        elif ball.radius >= claim_radius:
            estimates.append(0.0)

        line_y = self._num("goal_line_y", 0.88) * frame.height
        crossing = ball.time_to_line(line_y)
        if crossing is not None:
            estimates.append(crossing)

        positive = [e for e in estimates if e >= 0.0]
        return min(positive) if positive else None

    def _impact_x(self, ball: BallState, frame: Frame,
                  impact_in: Optional[float]) -> float:
        """Where across the frame the ball will be when it arrives (0..1)."""
        line_y = self._num("goal_line_y", 0.88) * frame.height
        crossing = ball.crossing_x(line_y)
        if crossing is None and impact_in is not None:
            crossing = ball.predict(impact_in)[0]
        if crossing is None:
            crossing = ball.position[0]
        return clamp(crossing / max(1.0, frame.width), -0.5, 1.5)

    def _camera_nudge(self, ball_x: float, frame: Frame) -> float:
        """How far to swing the view to put the ball back in the middle.

        The keeper punches and dives where the camera is pointing, so keeping
        the ball centred is the same job as aiming.
        """
        centre = 0.5
        error = (ball_x / max(1.0, frame.width)) - centre
        if abs(error) < self._num("camera_deadzone", 0.035):
            return 0.0
        return error * frame.width

    # ---------------------------------------------------------------- deciding

    def decide(self, ball: BallState, now: float, frame: Frame) -> Action:
        """Pick this frame's move."""
        home_x = self._num("home_x", 0.5)
        recover_time = self._num("recover_time", 0.9)

        # A committed action plays out; interrupting a dive mid-air achieves
        # nothing except standing the keeper up in the wrong place.
        if self.state in (DIVE, PUNCH) and self._elapsed(now) < 0.18:
            action = Action(state=self.state)
            if self.state == DIVE and self.dive_direction:
                action.keep("left" if self.dive_direction < 0 else "right")
            return action.because("committed")

        if self.state in (DIVE, PUNCH) and self._elapsed(now) < recover_time:
            self._enter(RECOVER, now)

        if not ball.visible:
            return self._decide_blind(now, frame)

        self.last_seen = now
        bx_norm = ball.position[0] / max(1.0, frame.width)
        camera = self._camera_nudge(ball.position[0], frame)

        # Ball filling the frame and going nowhere: it is in our hands.
        claim_radius = self._num("claim_radius", 46.0)
        holding = (ball.radius >= claim_radius * 1.25
                   and ball.speed < frame.width * 0.12
                   and abs(bx_norm - 0.5) < 0.22)
        if holding:
            return self._decide_distribute(now, camera)
        self._holding_since = None

        if self.state == RECOVER and self._elapsed(now) < recover_time:
            return self._decide_recover(now, bx_norm, home_x, camera)

        impact_in = self._impact_time(ball, frame)
        shot = self._is_shot(ball, impact_in, frame)
        if shot:
            return self._decide_save(ball, now, frame, impact_in, camera)

        if ball.radius >= claim_radius * 0.92:
            return self._decide_claim(now, bx_norm, camera)

        if ball.radius >= self._num("box_radius", 26.0):
            return self._decide_set(now, bx_norm, home_x, camera)

        return self._decide_hold_line(now, bx_norm, home_x, camera)

    # ------------------------------------------------------------- behaviours

    def _decide_blind(self, now: float, frame: Frame) -> Action:
        """Nothing on screen: drift home and sweep the view to find play."""
        if self.last_seen < 0:
            self._enter(IDLE, now)
            return Action(state=IDLE).because("waiting for the ball")

        self._enter(SEARCH, now)
        # Alternate the sweep so the keeper does not spin on the spot forever.
        if self._elapsed(now) > 1.6:
            self.sweep_direction *= -1
            self.state_since = now
        # Scaled against the full-deflection nudge tracking uses (half a frame),
        # so a sweep pans at a findable speed rather than creeping.
        sweep = self._num("search_sweep", 0.45) * frame.width * 0.4
        return (Action(state=SEARCH)
                .look(sweep * self.sweep_direction)
                .because("lost the ball, sweeping"))

    def _is_shot(self, ball: BallState, impact_in: Optional[float],
                 frame: Frame) -> bool:
        """Is this ball actually coming at the goal, and arriving soon?

        Pace is what separates a shot from a ball trickling towards the keeper:
        a loose ball at the feet is to be picked up, not dived at.
        """
        window = self._num("dive_window", 0.42)
        if impact_in is None or impact_in > window:
            return False
        if ball.growth >= self._num("shot_growth", 38.0):
            return True
        # A shot driven flat barely swells, so fall back to how fast it is
        # crossing the screen: roughly half the frame per second or better.
        quick = ball.speed >= frame.width * 0.55
        return quick and ball.velocity[1] > 0 and impact_in <= window * 0.6

    def _decide_save(self, ball: BallState, now: float, frame: Frame,
                     impact_in: Optional[float], camera: float) -> Action:
        """The shot is live — punch it, or go full length."""
        home_x = self._num("home_x", 0.5)
        reach = self._num("punch_reach", 0.11)
        impact_x = self._impact_x(ball, frame, impact_in)
        offset = impact_x - home_x
        by_norm = ball.position[1] / max(1.0, frame.height)
        high = by_norm < self._num("high_ball_y", 0.55)

        # Straight at the keeper, or up around the head: stay tall and punch.
        punchable = abs(offset) <= reach or (high and abs(offset) <= reach * 1.6)
        if punchable and now - self.last_punch >= self._num("punch_cooldown", 0.45):
            self.last_punch = now
            self._enter(PUNCH, now)
            action = Action(state=PUNCH).press("punch").look(camera)
            drift = sign(offset, reach * 0.35)
            if drift:
                action.keep("left" if drift < 0 else "right")
            return action.because("punching it clear (%+.2f)" % offset)

        if now - self.last_dive < self._num("dive_cooldown", 1.15):
            # Cannot dive again yet: at least shuffle across and stay big.
            drift = sign(offset, self._num("track_deadzone", 0.045))
            action = Action(state=SET).look(camera)
            if drift:
                action.keep("left" if drift < 0 else "right")
            return action.because("dive cooling down, shuffling")

        self.dive_direction = sign(offset, 0.0) or 1
        self.last_dive = now
        self._enter(DIVE, now)
        return (Action(state=DIVE)
                .press("dive")
                .keep("left" if self.dive_direction < 0 else "right")
                .look(camera)
                .because("diving %s (%+.2f)"
                         % ("left" if self.dive_direction < 0 else "right", offset)))

    def _decide_claim(self, now: float, bx_norm: float, camera: float) -> Action:
        """Loose ball at the keeper's feet: come and take it."""
        self._enter(CLAIM, now)
        action = Action(state=CLAIM).keep("forward").look(camera)
        if self.t.get("sprint_to_claim", True):
            action.keep("sprint")
        drift = sign(bx_norm - self._num("home_x", 0.5),
                     self._num("track_deadzone", 0.045))
        if drift:
            action.keep("left" if drift < 0 else "right")
        if now - self.last_punch >= self._num("punch_cooldown", 0.45):
            self.last_punch = now
            action.press("punch")
        return action.because("claiming the loose ball")

    def _decide_set(self, now: float, bx_norm: float, home_x: float,
                    camera: float) -> Action:
        """Ball in the box but no shot yet: small steps, stay balanced."""
        self._enter(SET, now)
        action = Action(state=SET).look(camera)
        drift = sign(bx_norm - home_x, self._num("track_deadzone", 0.045) * 0.7)
        if drift:
            action.keep("left" if drift < 0 else "right")
        return action.because("set, watching the shot")

    def _decide_hold_line(self, now: float, bx_norm: float, home_x: float,
                          camera: float) -> Action:
        """Ball upfield: shadow it across the goal, cutting the angle."""
        self._enter(HOLD_LINE, now)
        depth = clamp(self._num("line_depth", 0.18), 0.0, 1.0)
        post_l = self._num("post_left", 0.20)
        post_r = self._num("post_right", 0.80)
        # Stand between the ball and the middle of the goal, never outside the
        # posts — the near post is the one that must not be left open.
        target = clamp(home_x + (bx_norm - home_x) * (1.0 - depth), post_l, post_r)
        action = Action(state=HOLD_LINE).look(camera)
        drift = sign(target - home_x, self._num("track_deadzone", 0.045))
        if drift:
            action.keep("left" if drift < 0 else "right")
        return action.because("holding the line at %.2f" % target)

    def _decide_recover(self, now: float, bx_norm: float, home_x: float,
                        camera: float) -> Action:
        """Just been beaten or made a save: get back on your feet and re-set."""
        action = Action(state=RECOVER).look(camera)
        drift = sign(home_x - bx_norm, self._num("track_deadzone", 0.045))
        if drift:
            action.keep("left" if drift < 0 else "right")
        return action.because("recovering")

    def _decide_distribute(self, now: float, camera: float) -> Action:
        """Ball is held: get it upfield before someone closes in."""
        if self._holding_since is None:
            self._holding_since = now
        self._enter(DISTRIBUTE, now)
        action = Action(state=DISTRIBUTE).look(camera * 0.3)

        mode = str(self.t.get("distribute_with", "lob")).lower()
        waited = now - self._holding_since >= self._num("distribute_delay", 0.8)
        cooled = now - self.last_distribute >= 1.5
        if mode != "none" and waited and cooled:
            self.last_distribute = now
            action.press("lob" if mode == "lob" else "request")
            return action.because("clearing it with a %s" % mode)
        return action.because("holding, about to clear")
