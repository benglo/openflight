"""End-to-end tests for the replay CLI."""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

FIXTURE = Path(__file__).parent / "fixtures" / "synthetic_session.jsonl"
CLI = Path(__file__).parents[2] / "scripts" / "analysis" / "replay_session.py"


def _synth_iq(speed_mph: float, n: int = 4096, sr: int = 30000):
    wavelength = 0.01243
    speed_mps = speed_mph / 2.23694
    freq = 2 * speed_mps / wavelength
    t = np.arange(n) / sr
    phase = 2 * np.pi * freq * t
    i = (2048 + 500 * np.cos(phase)).astype(int).tolist()
    q = (2048 + 500 * np.sin(phase)).astype(int).tolist()
    return i, q


def _build_fixture(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps({"type": "session_start", "session_id": "synthetic"})]
    for n, speed in enumerate([120.0, 145.0, 95.0], start=1):
        i, q = _synth_iq(speed)
        lines.append(
            json.dumps(
                {
                    "type": "rolling_buffer_capture",
                    "shot_number": n,
                    "i_samples": i,
                    "q_samples": q,
                    "sample_time": float(n),
                    "trigger_time": float(n) + 0.1,
                    "ball_speed_mph": speed,
                    "spin_rpm": 2500 + n * 100,
                }
            )
        )
        lines.append(
            json.dumps(
                {
                    "type": "shot_detected",
                    "shot_number": n,
                    "ball_speed_mph": speed,
                    "club_speed_mph": speed * 0.7,
                    "spin_rpm": 2500 + n * 100,
                    "spin_confidence": 0.7,
                    "club": "driver",
                    "estimated_carry_yards": 250.0,
                }
            )
        )
    path.write_text("\n".join(lines))


@pytest.fixture(autouse=True)
def _ensure_fixture():
    if not FIXTURE.exists():
        _build_fixture(FIXTURE)


def test_cli_runs_on_single_file_and_emits_schema(tmp_path):
    output = tmp_path / "report.json"
    result = subprocess.run(
        [sys.executable, str(CLI), str(FIXTURE), "--output", str(output)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert report["schema_version"] == 1
    assert "processor_config" in report
    assert len(report["sessions"]) == 1
    assert report["sessions"][0]["stats"]["total_captures"] == 3
    assert report["aggregate"]["total_captures"] == 3


def test_cli_runs_on_directory(tmp_path):
    dir_ = tmp_path / "sessions"
    dir_.mkdir()
    fixture_text = FIXTURE.read_text()
    (dir_ / "session_001.jsonl").write_text(fixture_text)
    (dir_ / "session_002.jsonl").write_text(fixture_text)
    output = tmp_path / "batch.json"
    result = subprocess.run(
        [sys.executable, str(CLI), str(dir_), "--output", str(output)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert len(report["sessions"]) == 2
    assert report["aggregate"]["total_captures"] == 6


def test_cli_summary_to_stdout():
    result = subprocess.run(
        [sys.executable, str(CLI), str(FIXTURE), "--summary"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "total_captures" in result.stdout
    assert "replay_detection_count" in result.stdout


def test_cli_returns_error_for_missing_target(tmp_path):
    result = subprocess.run(
        [sys.executable, str(CLI), str(tmp_path / "nope.jsonl")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0


def test_cli_processor_config_override_recorded(tmp_path):
    cfg = {
        "sample_rate": 30000,
        "window_size": 128,
        "fft_size": 4096,
        "step_size_overlap": 32,
        "dc_mask_bins": 200,  # overridden from default 150
        "magnitude_threshold": 5,
        "spin_bandpass_bw_hz": 700,
        "spin_snr_high": 8.0,
        "spin_snr_medium": 5.0,
        "spin_snr_min": 3.0,
    }
    cfg_path = tmp_path / "cfg.json"
    cfg_path.write_text(json.dumps(cfg))
    output = tmp_path / "report.json"
    result = subprocess.run(
        [
            sys.executable,
            str(CLI),
            str(FIXTURE),
            "--output",
            str(output),
            "--processor-config",
            str(cfg_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(output.read_text())
    assert report["processor_config"]["dc_mask_bins"] == 200
    assert report["processor_config"]["magnitude_threshold"] == 5
