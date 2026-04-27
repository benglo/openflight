"""Tests for replay aggregate statistics."""

from openflight.replay.aggregate import compute_batch_aggregate, compute_session_stats
from openflight.replay.types import CaptureComparison, ReplayResult


def _cmp(num, orig_ball, repl_ball, orig_spin=None, repl_spin=None):
    orig = (
        ReplayResult(
            ball_speed_mph=orig_ball or 0.0,
            club_speed_mph=None,
            spin_rpm=orig_spin,
            spin_confidence=None,
            spin_snr=None,
            detected=bool(orig_ball and orig_ball > 0),
        )
        if orig_ball is not None
        else None
    )
    repl = ReplayResult(
        ball_speed_mph=repl_ball or 0.0,
        club_speed_mph=None,
        spin_rpm=repl_spin,
        spin_confidence=None,
        spin_snr=None,
        detected=bool(repl_ball and repl_ball > 0),
    )
    return CaptureComparison(shot_number=num, capture_line=num, original=orig, replayed=repl)


def test_session_stats_empty():
    stats = compute_session_stats([])
    assert stats["total_captures"] == 0
    assert stats["replay_detection_count"] == 0
    assert stats["regressions"] == 0
    assert stats["new_detections"] == 0


def test_session_stats_basic_counts():
    cmps = [
        _cmp(1, 140.0, 142.0),  # both detect
        _cmp(2, 150.0, 0.0),  # regression
        _cmp(3, 0.0, 145.0),  # new detection
        _cmp(4, 0.0, 0.0),  # neither
    ]
    s = compute_session_stats(cmps)
    assert s["total_captures"] == 4
    assert s["replay_detection_count"] == 2
    assert s["original_detection_count"] == 2
    assert s["regressions"] == 1
    assert s["new_detections"] == 1


def test_session_stats_ball_speed_mae():
    cmps = [
        _cmp(1, 140.0, 142.0),  # +2 abs
        _cmp(2, 150.0, 148.0),  # -2 abs
        _cmp(3, 0.0, 145.0),  # excluded (no original detection)
    ]
    s = compute_session_stats(cmps)
    assert s["ball_speed_mae_mph"] == 2.0
    assert s["ball_speed_compared_count"] == 2


def test_session_stats_spin_mae():
    cmps = [
        _cmp(1, 140.0, 142.0, orig_spin=2500, repl_spin=2400),
        _cmp(2, 150.0, 148.0, orig_spin=2700, repl_spin=2750),
        _cmp(3, 130.0, 132.0, orig_spin=None, repl_spin=2200),  # excluded
    ]
    s = compute_session_stats(cmps)
    assert s["spin_mae_rpm"] == 75.0
    assert s["spin_compared_count"] == 2


def test_batch_aggregate_sums_sessions():
    a = {
        "total_captures": 3,
        "replay_detection_count": 2,
        "regressions": 1,
        "new_detections": 0,
        "original_detection_count": 3,
        "ball_speed_mae_mph": 2.0,
        "ball_speed_compared_count": 2,
        "spin_mae_rpm": 50.0,
        "spin_compared_count": 1,
    }
    b = {
        "total_captures": 2,
        "replay_detection_count": 2,
        "regressions": 0,
        "new_detections": 1,
        "original_detection_count": 1,
        "ball_speed_mae_mph": 1.0,
        "ball_speed_compared_count": 1,
        "spin_mae_rpm": 100.0,
        "spin_compared_count": 1,
    }
    agg = compute_batch_aggregate([a, b])
    assert agg["total_captures"] == 5
    assert agg["regressions"] == 1
    assert agg["new_detections"] == 1
    # Weighted MAE: (2.0*2 + 1.0*1) / 3 = 5/3
    assert abs(agg["ball_speed_mae_mph"] - 5 / 3) < 1e-9
    assert agg["ball_speed_compared_count"] == 3
    # Weighted spin MAE: (50*1 + 100*1) / 2 = 75
    assert agg["spin_mae_rpm"] == 75.0


def test_batch_aggregate_empty():
    agg = compute_batch_aggregate([])
    assert agg["total_captures"] == 0
    assert agg["ball_speed_mae_mph"] == 0.0


def test_batch_aggregate_no_compared_avoids_divide_by_zero():
    """If no session compared any ball speeds, batch MAE is 0 (not NaN)."""
    s = {
        "total_captures": 2,
        "replay_detection_count": 0,
        "regressions": 0,
        "new_detections": 0,
        "original_detection_count": 0,
        "ball_speed_mae_mph": 0.0,
        "ball_speed_compared_count": 0,
        "spin_mae_rpm": 0.0,
        "spin_compared_count": 0,
    }
    agg = compute_batch_aggregate([s, s])
    assert agg["ball_speed_mae_mph"] == 0.0
    assert agg["spin_mae_rpm"] == 0.0
