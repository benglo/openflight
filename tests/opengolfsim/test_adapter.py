"""Tests for the openflight.Shot -> OpenGolfSim packet adapter."""

from datetime import datetime

import pytest

from openflight.launch_monitor import ClubType, Shot
from openflight.opengolfsim.adapter import shot_to_packet


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
