"""Tests for the session JSONL loader and capture/shot pairing."""

import json

from openflight.replay.loader import load_session


def test_load_empty_file(tmp_path):
    f = tmp_path / "empty.jsonl"
    f.write_text("")
    pairs = load_session(f)
    assert pairs == []


def test_load_capture_without_matching_shot(tmp_path):
    f = tmp_path / "orphan.jsonl"
    f.write_text(
        json.dumps(
            {
                "type": "rolling_buffer_capture",
                "shot_number": 1,
                "i_samples": [0, 0, 0],
                "q_samples": [0, 0, 0],
                "sample_time": 1.0,
                "trigger_time": 1.05,
                "ball_speed_mph": 50.0,
            }
        )
        + "\n"
    )
    pairs = load_session(f)
    assert len(pairs) == 1
    assert pairs[0].capture["shot_number"] == 1
    assert pairs[0].shot is None
    assert pairs[0].line_number == 1


def test_load_pairs_capture_and_shot_by_shot_number(tmp_path):
    f = tmp_path / "paired.jsonl"
    f.write_text(
        json.dumps({"type": "session_start", "session_id": "x"})
        + "\n"
        + json.dumps(
            {
                "type": "rolling_buffer_capture",
                "shot_number": 7,
                "i_samples": [1],
                "q_samples": [1],
                "sample_time": 0.0,
                "trigger_time": 0.1,
                "ball_speed_mph": 145.0,
                "spin_rpm": 2500,
            }
        )
        + "\n"
        + json.dumps(
            {
                "type": "shot_detected",
                "shot_number": 7,
                "ball_speed_mph": 145.2,
                "club_speed_mph": 102.0,
                "spin_rpm": 2510,
                "spin_confidence": 0.8,
                "club": "driver",
                "estimated_carry_yards": 270,
            }
        )
        + "\n"
    )
    pairs = load_session(f)
    assert len(pairs) == 1
    assert pairs[0].capture["shot_number"] == 7
    assert pairs[0].shot is not None
    assert pairs[0].shot["shot_number"] == 7


def test_load_skips_malformed_lines(tmp_path):
    f = tmp_path / "malformed.jsonl"
    f.write_text(
        "this is not json\n"
        + json.dumps(
            {
                "type": "rolling_buffer_capture",
                "shot_number": 1,
                "i_samples": [0],
                "q_samples": [0],
                "sample_time": 0.0,
                "trigger_time": 0.1,
            }
        )
        + "\n"
        + "{partial json\n"
    )
    pairs = load_session(f)
    assert len(pairs) == 1
    assert pairs[0].capture["shot_number"] == 1


def test_load_handles_multiple_captures_in_order(tmp_path):
    f = tmp_path / "multi.jsonl"
    lines = []
    for n in (1, 2, 3):
        lines.append(
            json.dumps(
                {
                    "type": "rolling_buffer_capture",
                    "shot_number": n,
                    "i_samples": [n],
                    "q_samples": [n],
                    "sample_time": float(n),
                    "trigger_time": float(n) + 0.1,
                }
            )
        )
        lines.append(
            json.dumps(
                {
                    "type": "shot_detected",
                    "shot_number": n,
                    "ball_speed_mph": 100.0 + n,
                }
            )
        )
    f.write_text("\n".join(lines))
    pairs = load_session(f)
    assert [p.capture["shot_number"] for p in pairs] == [1, 2, 3]
    assert [p.shot["ball_speed_mph"] for p in pairs] == [101.0, 102.0, 103.0]


def test_load_returns_empty_for_missing_path(tmp_path):
    pairs = load_session(tmp_path / "does_not_exist.jsonl")
    assert pairs == []
