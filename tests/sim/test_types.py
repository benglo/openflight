"""Tests for the sim-agnostic result types."""

from openflight.sim import SimPlayerUpdate, SimShotResult


def test_sim_shot_result_to_dict_roundtrip():
    r = SimShotResult(
        source="opengolfsim",
        carry_yards=214.0,
        total_yards=221.5,
        max_height_yards=20.5,
        lateral_yards=-1.2,
        roll_yards=7.5,
        sim_session_id="22",
    )
    d = r.to_dict()
    assert d["source"] == "opengolfsim"
    assert d["carry_yards"] == 214.0
    assert d["total_yards"] == 221.5
    assert d["lateral_yards"] == -1.2
    assert d["roll_yards"] == 7.5
    assert d["sim_session_id"] == "22"


def test_sim_shot_result_optional_fields_default_to_none():
    r = SimShotResult(
        source="gspro",
        carry_yards=200.0,
        total_yards=215.0,
        max_height_yards=18.0,
        lateral_yards=0.0,
    )
    assert r.roll_yards is None
    assert r.sim_session_id is None


def test_sim_player_update_to_dict():
    u = SimPlayerUpdate(source="opengolfsim", club_id="7I", club_name="7-Iron")
    d = u.to_dict()
    assert d == {"source": "opengolfsim", "club_id": "7I", "club_name": "7-Iron"}


def test_sim_shot_result_is_frozen():
    """Sim results are values; mutating them after creation is a bug."""
    import dataclasses

    r = SimShotResult(
        source="opengolfsim",
        carry_yards=200.0,
        total_yards=215.0,
        max_height_yards=18.0,
        lateral_yards=0.0,
    )
    try:
        r.carry_yards = 999.0  # type: ignore[misc]
    except dataclasses.FrozenInstanceError:
        pass
    else:
        raise AssertionError("expected FrozenInstanceError")
