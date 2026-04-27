"""Sim-agnostic types for forwarding shots to and consuming results from
external golf simulators (OpenGolfSim, GSPro, E6, TGC, etc.).

Each sim integration converts its own native protocol into the
``SimShotResult`` / ``SimPlayerUpdate`` shapes defined here, so the
server and UI can stay sim-agnostic and the front-end doesn't need to
know which sim is connected.
"""

from .types import SimPlayerUpdate, SimShotResult

__all__ = ["SimPlayerUpdate", "SimShotResult"]
