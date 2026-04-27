"""Tests for the single-capture replay engine."""

import numpy as np
import pytest

from openflight.replay.engine import build_batch_report, replay_capture, replay_session
from openflight.replay.loader import PairedCapture
from openflight.replay.types import BatchReport, ReplayResult


def _synth_iq(speed_mph: float, n_samples: int = 4096, sample_rate: int = 30000):
    """Synthesize a complex sinusoid at the Doppler frequency for `speed_mph`.

    Positive frequencies = outbound (matches OPS243-A I/Q convention).
    ADC is 12-bit centered on 2048; signal amplitude is ~25% of full-scale.
    """
    wavelength_m = 0.01243
    speed_mps = speed_mph / 2.23694
    freq_hz = 2 * speed_mps / wavelength_m
    t = np.arange(n_samples) / sample_rate
    phase = 2 * np.pi * freq_hz * t
    amp = 500
    i = (2048 + amp * np.cos(phase)).astype(int).tolist()
    q = (2048 + amp * np.sin(phase)).astype(int).tolist()
    return i, q


def test_replay_capture_detects_strong_synthetic_tone():
    i, q = _synth_iq(speed_mph=120.0)
    capture_entry = {
        "shot_number": 1,
        "i_samples": i,
        "q_samples": q,
        "sample_time": 0.0,
        "trigger_time": 0.0,
    }
    result = replay_capture(capture_entry)
    assert result.detected is True
    assert result.ball_speed_mph == pytest.approx(120.0, abs=2.0)


def test_replay_capture_returns_not_detected_for_zero_signal():
    capture_entry = {
        "shot_number": 1,
        "i_samples": [2048] * 4096,
        "q_samples": [2048] * 4096,
        "sample_time": 0.0,
        "trigger_time": 0.0,
    }
    result = replay_capture(capture_entry)
    assert result.detected is False
    assert result.ball_speed_mph == 0.0


def test_replay_capture_result_is_replayresult_type():
    i, q = _synth_iq(speed_mph=80.0)
    capture_entry = {
        "shot_number": 1,
        "i_samples": i,
        "q_samples": q,
        "sample_time": 0.0,
        "trigger_time": 0.0,
    }
    result = replay_capture(capture_entry)
    assert isinstance(result, ReplayResult)
    assert result.ball_speed_mph >= 0


def test_replay_capture_accepts_processor_override():
    from openflight.rolling_buffer.processor import RollingBufferProcessor

    proc = RollingBufferProcessor(sample_rate=30000)
    i, q = _synth_iq(speed_mph=100.0)
    entry = {
        "shot_number": 1,
        "i_samples": i,
        "q_samples": q,
        "sample_time": 0.0,
        "trigger_time": 0.0,
    }
    result = replay_capture(entry, processor=proc)
    assert result.detected is True
    assert result.ball_speed_mph == pytest.approx(100.0, abs=2.0)


def test_replay_session_pairs_yields_one_comparison_per_capture():
    i_a, q_a = _synth_iq(speed_mph=130.0)
    i_b, q_b = _synth_iq(speed_mph=90.0)
    pairs = [
        PairedCapture(
            capture={
                "shot_number": 1,
                "i_samples": i_a,
                "q_samples": q_a,
                "sample_time": 0.0,
                "trigger_time": 0.0,
                "ball_speed_mph": 130.0,
            },
            shot={"shot_number": 1, "ball_speed_mph": 130.0},
            line_number=10,
        ),
        PairedCapture(
            capture={
                "shot_number": 2,
                "i_samples": i_b,
                "q_samples": q_b,
                "sample_time": 0.0,
                "trigger_time": 0.0,
                "ball_speed_mph": 90.0,
            },
            shot=None,
            line_number=20,
        ),
    ]
    comparisons = replay_session(pairs)
    assert len(comparisons) == 2
    assert comparisons[0].shot_number == 1
    assert comparisons[0].capture_line == 10
    assert comparisons[0].original is not None
    assert comparisons[0].replayed.detected is True
    assert comparisons[1].shot_number == 2
    assert comparisons[1].capture_line == 20


def test_build_batch_report_uses_default_processor_config():
    report = build_batch_report(session_reports=[])
    assert isinstance(report, BatchReport)
    assert report.schema_version == 1
    assert report.processor_config.sample_rate == 30000


def test_original_result_uses_capture_entry_values_when_present():
    """When the capture entry already records ball_speed_mph (as the live
    session_logger does), the original ReplayResult should reflect that —
    not the derived value from the shot entry, which can drift if downstream
    processing (e.g. spin-adjusted carry) altered any field."""
    pair = PairedCapture(
        capture={
            "shot_number": 5,
            "i_samples": [2048] * 4096,
            "q_samples": [2048] * 4096,
            "sample_time": 0.0,
            "trigger_time": 0.0,
            "ball_speed_mph": 142.5,
            "spin_rpm": 2700,
            "spin_confidence": 0.7,
            "spin_snr": 8.1,
        },
        shot={"shot_number": 5, "ball_speed_mph": 999.9},  # deliberately different
        line_number=1,
    )
    comparisons = replay_session([pair])
    assert comparisons[0].original is not None
    assert comparisons[0].original.ball_speed_mph == 142.5
    assert comparisons[0].original.spin_rpm == 2700
