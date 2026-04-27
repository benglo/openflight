"""Sim-agnostic result and player-update types.

Distances are in YARDS to match OpenFlight's native unit. Sim adapters
that emit metres (e.g. OpenGolfSim) convert at the boundary.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional


@dataclass(frozen=True)
class SimShotResult:
    """Normalized result emitted by an external simulator after rendering a shot.

    Distances are in YARDS. ``source`` identifies the sim adapter that
    produced the result (e.g. ``"opengolfsim"``, ``"gspro"``).
    """

    source: str
    carry_yards: float
    total_yards: float
    max_height_yards: float
    lateral_yards: float
    roll_yards: Optional[float] = None
    sim_session_id: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class SimPlayerUpdate:
    """Normalized player/club update emitted by an external simulator."""

    source: str
    club_id: Optional[str] = None  # raw sim-side id (e.g. "3W", "PW") for diagnostics
    club_name: Optional[str] = None  # human-readable label

    def to_dict(self) -> dict:
        return asdict(self)
