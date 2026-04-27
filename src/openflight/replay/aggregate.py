"""Compute summary statistics over CaptureComparison lists."""

from __future__ import annotations

from .types import CaptureComparison


def _empty_stats() -> dict:
    return {
        "total_captures": 0,
        "replay_detection_count": 0,
        "original_detection_count": 0,
        "regressions": 0,
        "new_detections": 0,
        "ball_speed_mae_mph": 0.0,
        "ball_speed_compared_count": 0,
        "spin_mae_rpm": 0.0,
        "spin_compared_count": 0,
    }


def compute_session_stats(comparisons: list[CaptureComparison]) -> dict:
    """Aggregate per-capture comparisons into a single session-level stats dict."""
    total = len(comparisons)
    if total == 0:
        return _empty_stats()

    replay_det = sum(1 for c in comparisons if c.replayed.detected)
    orig_det = sum(1 for c in comparisons if c.original and c.original.detected)
    regressions = sum(1 for c in comparisons if c.regression)
    new_dets = sum(1 for c in comparisons if c.new_detection)

    # Ball speed MAE — only over captures where both original and replayed detected.
    ball_diffs = [
        abs(c.original.ball_speed_mph - c.replayed.ball_speed_mph)
        for c in comparisons
        if c.original and c.original.detected and c.replayed.detected
    ]
    ball_mae = sum(ball_diffs) / len(ball_diffs) if ball_diffs else 0.0

    # Spin MAE — only over captures where both reported a spin RPM.
    spin_diffs = [
        abs(c.original.spin_rpm - c.replayed.spin_rpm)
        for c in comparisons
        if c.original and c.original.spin_rpm is not None and c.replayed.spin_rpm is not None
    ]
    spin_mae = sum(spin_diffs) / len(spin_diffs) if spin_diffs else 0.0

    return {
        "total_captures": total,
        "replay_detection_count": replay_det,
        "original_detection_count": orig_det,
        "regressions": regressions,
        "new_detections": new_dets,
        "ball_speed_mae_mph": ball_mae,
        "ball_speed_compared_count": len(ball_diffs),
        "spin_mae_rpm": spin_mae,
        "spin_compared_count": len(spin_diffs),
    }


def compute_batch_aggregate(session_stats: list[dict]) -> dict:
    """Aggregate per-session stats into a batch summary.

    Counts are summed directly. MAE values are weighted by their respective
    *_compared_count so the batch MAE reflects each comparison equally,
    rather than each session equally.
    """
    if not session_stats:
        return _empty_stats()

    def _sum(key: str):
        return sum(s.get(key, 0) for s in session_stats)

    def _weighted_mae(value_key: str, count_key: str) -> float:
        total_count = _sum(count_key)
        if total_count == 0:
            return 0.0
        weighted = sum(s.get(value_key, 0.0) * s.get(count_key, 0) for s in session_stats)
        return weighted / total_count

    return {
        "total_captures": _sum("total_captures"),
        "replay_detection_count": _sum("replay_detection_count"),
        "original_detection_count": _sum("original_detection_count"),
        "regressions": _sum("regressions"),
        "new_detections": _sum("new_detections"),
        "ball_speed_mae_mph": _weighted_mae("ball_speed_mae_mph", "ball_speed_compared_count"),
        "ball_speed_compared_count": _sum("ball_speed_compared_count"),
        "spin_mae_rpm": _weighted_mae("spin_mae_rpm", "spin_compared_count"),
        "spin_compared_count": _sum("spin_compared_count"),
    }
