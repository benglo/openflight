"""Replay one capture (or a batch of paired captures) through the processor."""

from __future__ import annotations

from typing import Optional

from openflight.rolling_buffer.processor import RollingBufferProcessor
from openflight.rolling_buffer.types import IQCapture

from .loader import PairedCapture
from .types import (
    SCHEMA_VERSION,
    BatchReport,
    CaptureComparison,
    ProcessorConfig,
    ReplayResult,
    SessionReport,
)


def processor_from_config(config: ProcessorConfig) -> RollingBufferProcessor:
    """Build a RollingBufferProcessor whose tunables match the given config.

    The set of fields we forward as overrides intentionally excludes
    ``sample_rate`` (handled as the dedicated positional arg) and any
    ProcessorConfig fields that don't map to a tunable on the processor.
    """
    return RollingBufferProcessor(
        sample_rate=config.sample_rate,
        window_size=config.window_size,
        fft_size=config.fft_size,
        step_size_overlap=config.step_size_overlap,
        dc_mask_bins=config.dc_mask_bins,
        magnitude_threshold=config.magnitude_threshold,
        spin_bandpass_bw_hz=config.spin_bandpass_bw_hz,
        spin_snr_high=config.spin_snr_high,
        spin_snr_medium=config.spin_snr_medium,
        spin_snr_min=config.spin_snr_min,
    )


def _to_iq(capture_entry: dict) -> IQCapture:
    return IQCapture(
        sample_time=capture_entry.get("sample_time", 0.0),
        trigger_time=capture_entry.get("trigger_time", 0.0),
        i_samples=capture_entry["i_samples"],
        q_samples=capture_entry["q_samples"],
    )


def replay_capture(
    capture_entry: dict,
    processor: Optional[RollingBufferProcessor] = None,
) -> ReplayResult:
    """Replay one rolling_buffer_capture entry through the processor."""
    proc = processor or RollingBufferProcessor()
    iq = _to_iq(capture_entry)
    processed = proc.process_capture(iq)

    if processed is None:
        return ReplayResult(
            ball_speed_mph=0.0,
            club_speed_mph=None,
            spin_rpm=None,
            spin_confidence=None,
            spin_snr=None,
            detected=False,
        )

    spin = processed.spin
    # SpinResult.no_spin_detected() returns spin_rpm=0; treat that as no spin.
    spin_detected = spin is not None and spin.spin_rpm > 0
    return ReplayResult(
        ball_speed_mph=float(processed.ball_speed_mph),
        club_speed_mph=(
            float(processed.club_speed_mph) if processed.club_speed_mph is not None else None
        ),
        spin_rpm=float(spin.spin_rpm) if spin_detected else None,
        spin_confidence=float(spin.confidence) if spin_detected else None,
        spin_snr=float(spin.snr) if spin_detected else None,
        detected=processed.ball_speed_mph > 0,
    )


def _original_from_pair(pair: PairedCapture) -> Optional[ReplayResult]:
    """Reconstruct the originally logged ReplayResult for this capture.

    Prefers the capture entry's own fields (recorded at capture time, so they
    most directly reflect what the live processor produced from this exact I/Q
    buffer). Falls back to the paired shot_detected entry for fields the
    capture doesn't carry.
    """
    cap = pair.capture
    shot = pair.shot or {}

    ball = cap.get("ball_speed_mph")
    if ball is None:
        ball = shot.get("ball_speed_mph")
    if ball is None:
        return None

    spin_rpm_raw = cap.get("spin_rpm") if cap.get("spin_rpm") is not None else shot.get("spin_rpm")
    spin_conf = (
        cap.get("spin_confidence")
        if cap.get("spin_confidence") is not None
        else shot.get("spin_confidence")
    )
    spin_snr = cap.get("spin_snr")

    # spin_rpm == 0 also means "not detected" per session_logger conventions.
    spin_detected = spin_rpm_raw is not None and spin_rpm_raw > 0
    return ReplayResult(
        ball_speed_mph=float(ball),
        club_speed_mph=(
            cap.get("club_speed_mph")
            if cap.get("club_speed_mph") is not None
            else shot.get("club_speed_mph")
        ),
        spin_rpm=float(spin_rpm_raw) if spin_detected else None,
        spin_confidence=float(spin_conf) if spin_conf is not None and spin_detected else None,
        spin_snr=float(spin_snr) if spin_snr is not None and spin_detected else None,
        detected=ball > 0,
    )


def replay_session(
    pairs: list[PairedCapture],
    processor: Optional[RollingBufferProcessor] = None,
) -> list[CaptureComparison]:
    proc = processor or RollingBufferProcessor()
    out: list[CaptureComparison] = []
    for pair in pairs:
        replayed = replay_capture(pair.capture, processor=proc)
        original = _original_from_pair(pair)
        out.append(
            CaptureComparison(
                shot_number=pair.capture.get("shot_number", -1),
                capture_line=pair.line_number,
                original=original,
                replayed=replayed,
            )
        )
    return out


def build_batch_report(
    session_reports: list[SessionReport],
    processor_config: Optional[ProcessorConfig] = None,
    aggregate: Optional[dict] = None,
) -> BatchReport:
    return BatchReport(
        schema_version=SCHEMA_VERSION,
        processor_config=processor_config or ProcessorConfig.default(),
        sessions=session_reports,
        aggregate=aggregate or {},
    )
