"""Convert openflight.Shot objects into OpenGolfSim shot packets."""

from __future__ import annotations

import logging
from typing import Optional

from openflight.launch_monitor import ClubType, Shot
from openflight.rolling_buffer.monitor import get_optimal_spin_for_ball_speed

from .protocol import (
    MAX_HORIZONTAL_DEG,
    MAX_SPIN_AXIS_DEG,
    MAX_VERTICAL_DEG,
    MIN_HORIZONTAL_DEG,
    MIN_SPIN_AXIS_DEG,
    MIN_VERTICAL_DEG,
    MSG_TYPE_SHOT,
    UNIT_IMPERIAL,
    UNIT_METRIC,
)

logger = logging.getLogger(__name__)

_MPS_PER_MPH = 0.44704
_VALID_UNITS = {UNIT_IMPERIAL, UNIT_METRIC}


def _clamp(value: float, low: float, high: float, *, name: str) -> float:
    if value < low:
        logger.info("[OPENGOLFSIM] Clamped %s %.2f -> %.2f (min)", name, value, low)
        return low
    if value > high:
        logger.info("[OPENGOLFSIM] Clamped %s %.2f -> %.2f (max)", name, value, high)
        return high
    return value


def shot_to_packet(shot: Shot, unit: str = UNIT_IMPERIAL) -> dict:
    """Build an OpenGolfSim ``{"type":"shot",...}`` packet from a Shot.

    Missing measurements are filled with documented defaults (horizontal=0,
    spinAxis=0, spinSpeed=club-typical) so the simulator always gets a
    usable shot rather than failing silently.

    Out-of-range values are clamped to the documented OpenGolfSim ranges.
    """
    if unit not in _VALID_UNITS:
        raise ValueError(f"unit must be one of {sorted(_VALID_UNITS)}; got {unit!r}")

    if unit == UNIT_METRIC:
        ball_speed = shot.ball_speed_mph * _MPS_PER_MPH
    else:
        ball_speed = shot.ball_speed_mph

    vertical = shot.launch_angle_vertical if shot.launch_angle_vertical is not None else 0.0
    horizontal = shot.launch_angle_horizontal if shot.launch_angle_horizontal is not None else 0.0
    spin_axis = shot.spin_axis_deg if shot.spin_axis_deg is not None else 0.0

    spin_rpm = shot.spin_rpm
    if spin_rpm is None or spin_rpm <= 0:
        spin_rpm = get_optimal_spin_for_ball_speed(shot.ball_speed_mph, shot.club)

    vertical = _clamp(vertical, MIN_VERTICAL_DEG, MAX_VERTICAL_DEG, name="verticalLaunchAngle")
    horizontal = _clamp(
        horizontal, MIN_HORIZONTAL_DEG, MAX_HORIZONTAL_DEG, name="horizontalLaunchAngle",
    )
    spin_axis = _clamp(spin_axis, MIN_SPIN_AXIS_DEG, MAX_SPIN_AXIS_DEG, name="spinAxis")

    return {
        "type": MSG_TYPE_SHOT,
        "unit": unit,
        "shot": {
            "ballSpeed": float(ball_speed),
            "verticalLaunchAngle": float(vertical),
            "horizontalLaunchAngle": float(horizontal),
            "spinSpeed": float(spin_rpm),
            "spinAxis": float(spin_axis),
        },
    }


# OpenGolfSim ships compact club identifiers like "Dr", "3W", "7I", "PW";
# OpenFlight's ClubType enum uses values like "driver", "3-wood", "7-iron",
# "pw". This table bridges the two so inbound player updates can swap the
# selected club without the user having to manually re-pick.
_OGS_CLUB_ID_TO_TYPE: dict[str, ClubType] = {
    "DR": ClubType.DRIVER,
    "D": ClubType.DRIVER,
    "DRIVER": ClubType.DRIVER,
    "3W": ClubType.WOOD_3,
    "5W": ClubType.WOOD_5,
    "7W": ClubType.WOOD_7,
    "3H": ClubType.HYBRID_3,
    "5H": ClubType.HYBRID_5,
    "7H": ClubType.HYBRID_7,
    "9H": ClubType.HYBRID_9,
    "2I": ClubType.IRON_2,
    "3I": ClubType.IRON_3,
    "4I": ClubType.IRON_4,
    "5I": ClubType.IRON_5,
    "6I": ClubType.IRON_6,
    "7I": ClubType.IRON_7,
    "8I": ClubType.IRON_8,
    "9I": ClubType.IRON_9,
    "PW": ClubType.PW,
    "GW": ClubType.GW,
    "SW": ClubType.SW,
    "LW": ClubType.LW,
}


def parse_ogs_club_id(club_id: Optional[str]) -> Optional[ClubType]:
    """Map an OpenGolfSim club id (e.g. ``"3W"``, ``"7I"``) to a ``ClubType``.

    Returns ``None`` if ``club_id`` is missing or doesn't match a known club.
    Comparison is case-insensitive and tolerant of surrounding whitespace.
    """
    if not club_id:
        return None
    return _OGS_CLUB_ID_TO_TYPE.get(club_id.strip().upper())


__all__ = ["parse_ogs_club_id", "shot_to_packet"]
