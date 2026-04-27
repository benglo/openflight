"""Tests for replay schema dataclasses."""

import json

from openflight.replay.types import (
    BatchReport,
    CaptureComparison,
    ProcessorConfig,
    ReplayResult,
)


def test_processor_config_roundtrip():
    cfg = ProcessorConfig(
        sample_rate=30000,
        window_size=128,
        fft_size=4096,
        step_size_overlap=32,
        dc_mask_bins=150,
        magnitude_threshold=3,
        spin_bandpass_bw_hz=700,
        spin_snr_high=8.0,
        spin_snr_medium=5.0,
        spin_snr_min=3.0,
    )
    encoded = json.dumps(cfg.to_dict())
    decoded = ProcessorConfig.from_dict(json.loads(encoded))
    assert decoded == cfg


def test_capture_comparison_with_no_original():
    cmp_ = CaptureComparison(
        shot_number=1,
        capture_line=42,
        original=None,
        replayed=ReplayResult(
            ball_speed_mph=145.2,
            club_speed_mph=105.0,
            spin_rpm=2750,
            spin_confidence=0.8,
            spin_snr=9.1,
            detected=True,
        ),
    )
    d = cmp_.to_dict()
    assert d["original"] is None
    assert d["replayed"]["ball_speed_mph"] == 145.2
    assert d["regression"] is False
    assert d["new_detection"] is False


def test_capture_comparison_regression_detection():
    """Originally detected, replay no longer detects -> regression=True."""
    cmp_ = CaptureComparison(
        shot_number=2,
        capture_line=43,
        original=ReplayResult(
            ball_speed_mph=140.0,
            club_speed_mph=100.0,
            spin_rpm=2500,
            spin_confidence=0.7,
            spin_snr=7.5,
            detected=True,
        ),
        replayed=ReplayResult(
            ball_speed_mph=0.0,
            club_speed_mph=None,
            spin_rpm=None,
            spin_confidence=None,
            spin_snr=None,
            detected=False,
        ),
    )
    assert cmp_.regression is True
    assert cmp_.new_detection is False


def test_capture_comparison_new_detection():
    """Originally not detected, replay now detects -> new_detection=True."""
    cmp_ = CaptureComparison(
        shot_number=3,
        capture_line=44,
        original=ReplayResult(
            ball_speed_mph=0.0,
            club_speed_mph=None,
            spin_rpm=None,
            spin_confidence=None,
            spin_snr=None,
            detected=False,
        ),
        replayed=ReplayResult(
            ball_speed_mph=130.0,
            club_speed_mph=92.0,
            spin_rpm=2200,
            spin_confidence=0.6,
            spin_snr=6.5,
            detected=True,
        ),
    )
    assert cmp_.regression is False
    assert cmp_.new_detection is True


def test_batch_report_schema_version():
    report = BatchReport(
        schema_version=1,
        processor_config=ProcessorConfig.default(),
        sessions=[],
        aggregate={},
    )
    d = report.to_dict()
    assert d["schema_version"] == 1
    assert "processor_config" in d
    assert "sessions" in d
    assert "aggregate" in d
