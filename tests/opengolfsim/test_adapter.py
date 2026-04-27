"""Tests for the openflight.Shot -> OpenGolfSim packet adapter."""

from datetime import datetime

import pytest

from openflight.launch_monitor import ClubType, Shot
from openflight.opengolfsim.adapter import (
    parse_ogs_club_id,
    shot_to_packet,
    to_sim_player_update,
    to_sim_result,
)


def _shot(**kwargs) -> Shot:
    base = dict(ball_speed_mph=145.0, timestamp=datetime.now(), club=ClubType.DRIVER)
    base.update(kwargs)
    return Shot(**base)


def test_shot_to_packet_minimum_required_fields():
    s = _shot(
        launch_angle_vertical=12.0,
        launch_angle_horizontal=2.0,
        spin_rpm=2500,
        spin_axis_deg=-3.0,
    )
    pkt = shot_to_packet(s)
    assert pkt["type"] == "shot"
    assert pkt["unit"] == "imperial"
    assert pkt["shot"]["ballSpeed"] == 145.0
    assert pkt["shot"]["verticalLaunchAngle"] == 12.0
    assert pkt["shot"]["horizontalLaunchAngle"] == 2.0
    assert pkt["shot"]["spinSpeed"] == 2500
    assert pkt["shot"]["spinAxis"] == -3.0


def test_shot_to_packet_horizontal_default_when_missing():
    s = _shot(launch_angle_vertical=12.0, spin_rpm=2500, spin_axis_deg=0.0)
    pkt = shot_to_packet(s)
    assert pkt["shot"]["horizontalLaunchAngle"] == 0.0


def test_shot_to_packet_spin_axis_default_when_missing():
    s = _shot(launch_angle_vertical=12.0, launch_angle_horizontal=0.0, spin_rpm=2500)
    pkt = shot_to_packet(s)
    assert pkt["shot"]["spinAxis"] == 0.0


def test_shot_to_packet_spin_uses_optimal_when_missing():
    """spin_rpm None should fall back to club-typical value, not 0 or NaN."""
    s = _shot(launch_angle_vertical=12.0)
    pkt = shot_to_packet(s)
    assert pkt["shot"]["spinSpeed"] > 0


def test_shot_to_packet_spin_uses_optimal_when_zero():
    """spin_rpm 0 (knockdown shot mis-detected) should fall back."""
    s = _shot(launch_angle_vertical=12.0, spin_rpm=0)
    pkt = shot_to_packet(s)
    assert pkt["shot"]["spinSpeed"] > 0


def test_shot_to_packet_clamps_vertical_into_range():
    """Vertical angle of 60° (above sim's 45° max) is clamped, not dropped."""
    s = _shot(
        launch_angle_vertical=60.0,
        launch_angle_horizontal=0.0,
        spin_rpm=2500,
        spin_axis_deg=0.0,
    )
    pkt = shot_to_packet(s)
    assert pkt["shot"]["verticalLaunchAngle"] == 45.0


def test_shot_to_packet_clamps_negative_vertical_to_zero():
    """Negative launch angle (mishit) clamps to 0 (sim's documented minimum)."""
    s = _shot(
        launch_angle_vertical=-5.0,
        launch_angle_horizontal=0.0,
        spin_rpm=2500,
        spin_axis_deg=0.0,
    )
    pkt = shot_to_packet(s)
    assert pkt["shot"]["verticalLaunchAngle"] == 0.0


def test_shot_to_packet_clamps_horizontal_and_spin_axis():
    s = _shot(
        launch_angle_vertical=12.0,
        launch_angle_horizontal=-90.0,
        spin_rpm=2500,
        spin_axis_deg=80.0,
    )
    pkt = shot_to_packet(s)
    assert pkt["shot"]["horizontalLaunchAngle"] == -45.0
    assert pkt["shot"]["spinAxis"] == 45.0


def test_shot_to_packet_metric_unit_uses_mps():
    s = _shot(
        launch_angle_vertical=12.0,
        launch_angle_horizontal=0.0,
        spin_rpm=2500,
        spin_axis_deg=0.0,
    )
    pkt = shot_to_packet(s, unit="metric")
    assert pkt["unit"] == "metric"
    assert pkt["shot"]["ballSpeed"] == pytest.approx(145.0 * 0.44704, abs=0.01)


def test_shot_to_packet_metric_unit_invalid_raises():
    s = _shot(
        launch_angle_vertical=12.0,
        launch_angle_horizontal=0.0,
        spin_rpm=2500,
        spin_axis_deg=0.0,
    )
    with pytest.raises(ValueError):
        shot_to_packet(s, unit="furlongs_per_fortnight")


# --- parse_ogs_club_id ---


@pytest.mark.parametrize(
    "ogs_id, expected",
    [
        ("Dr", ClubType.DRIVER),
        ("D", ClubType.DRIVER),
        ("Driver", ClubType.DRIVER),
        ("3W", ClubType.WOOD_3),
        ("5W", ClubType.WOOD_5),
        ("7W", ClubType.WOOD_7),
        ("3H", ClubType.HYBRID_3),
        ("5H", ClubType.HYBRID_5),
        ("7H", ClubType.HYBRID_7),
        ("9H", ClubType.HYBRID_9),
        ("2I", ClubType.IRON_2),
        ("3I", ClubType.IRON_3),
        ("4I", ClubType.IRON_4),
        ("5I", ClubType.IRON_5),
        ("6I", ClubType.IRON_6),
        ("7I", ClubType.IRON_7),
        ("8I", ClubType.IRON_8),
        ("9I", ClubType.IRON_9),
        ("PW", ClubType.PW),
        ("GW", ClubType.GW),
        ("SW", ClubType.SW),
        ("LW", ClubType.LW),
    ],
)
def test_parse_ogs_club_id_known_codes(ogs_id, expected):
    assert parse_ogs_club_id(ogs_id) is expected


def test_parse_ogs_club_id_case_insensitive():
    assert parse_ogs_club_id("3w") is ClubType.WOOD_3
    assert parse_ogs_club_id("7i") is ClubType.IRON_7
    assert parse_ogs_club_id("pw") is ClubType.PW


def test_parse_ogs_club_id_strips_whitespace():
    assert parse_ogs_club_id("  3W  ") is ClubType.WOOD_3


def test_parse_ogs_club_id_unknown_returns_none():
    assert parse_ogs_club_id("zzz") is None
    assert parse_ogs_club_id("11I") is None


def test_parse_ogs_club_id_empty_returns_none():
    assert parse_ogs_club_id("") is None
    assert parse_ogs_club_id(None) is None


# --- to_sim_result ---


def test_to_sim_result_converts_metres_to_yards():
    """OGS reports distances in metres; the normalized type is in yards."""
    payload = {
        "result": {
            "carry": 196.06776428222656,
            "height": 18.728025436401367,
            "roll": 6.482479572296143,
            "total": 202.54876708984375,
            "lateral": -0.07558325678110123,
        },
        "sessionId": 22,
    }
    sim = to_sim_result(payload)
    assert sim is not None
    assert sim.source == "opengolfsim"
    assert sim.carry_yards == pytest.approx(214.39, abs=0.1)
    assert sim.total_yards == pytest.approx(221.49, abs=0.1)
    assert sim.max_height_yards == pytest.approx(20.48, abs=0.1)
    assert sim.lateral_yards == pytest.approx(-0.0827, abs=0.01)
    assert sim.roll_yards == pytest.approx(7.09, abs=0.1)
    assert sim.sim_session_id == "22"


def test_to_sim_result_missing_required_returns_none():
    """No carry / total in the payload -> None (caller decides how to react)."""
    assert to_sim_result({}) is None
    assert to_sim_result({"result": {}}) is None
    assert to_sim_result({"result": {"carry": 100}}) is None  # missing total
    assert to_sim_result({"result": {"total": 100}}) is None  # missing carry


def test_to_sim_result_height_and_lateral_default_to_zero():
    """OGS rarely omits these but if it does, default to 0 instead of crashing."""
    payload = {"result": {"carry": 100.0, "total": 110.0}}
    sim = to_sim_result(payload)
    assert sim is not None
    assert sim.max_height_yards == 0.0
    assert sim.lateral_yards == 0.0
    assert sim.roll_yards is None  # explicitly missing


# --- to_sim_player_update ---


def test_to_sim_player_update_pulls_club_id_and_name():
    payload = {"club": {"id": "7I", "name": "7-Iron", "distance": 165}}
    upd = to_sim_player_update(payload)
    assert upd.source == "opengolfsim"
    assert upd.club_id == "7I"
    assert upd.club_name == "7-Iron"


def test_to_sim_player_update_handles_missing_club():
    upd = to_sim_player_update({})
    assert upd.club_id is None
    assert upd.club_name is None
