"""Dataclasses defining the stable replay output schema."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Optional

SCHEMA_VERSION = 1


@dataclass
class ProcessorConfig:
    """Snapshot of RollingBufferProcessor constants at replay time.

    Recorded in every replay report so that two reports produced by
    different code revisions can be compared without ambiguity about
    which thresholds were active.
    """

    sample_rate: int
    window_size: int
    fft_size: int
    step_size_overlap: int
    dc_mask_bins: int
    magnitude_threshold: float
    spin_bandpass_bw_hz: float
    spin_snr_high: float
    spin_snr_medium: float
    spin_snr_min: float

    @classmethod
    def default(cls) -> "ProcessorConfig":
        # Imported lazily to avoid a hard dependency from this module on the
        # rolling buffer subpackage at import time.
        from openflight.rolling_buffer.processor import RollingBufferProcessor as P

        return cls(
            sample_rate=P.SAMPLE_RATE,
            window_size=P.WINDOW_SIZE,
            fft_size=P.FFT_SIZE,
            step_size_overlap=P.STEP_SIZE_OVERLAP,
            dc_mask_bins=P.DC_MASK_BINS,
            magnitude_threshold=P.MAGNITUDE_THRESHOLD,
            spin_bandpass_bw_hz=P.SPIN_BANDPASS_BW_HZ,
            spin_snr_high=P.SPIN_SNR_HIGH,
            spin_snr_medium=P.SPIN_SNR_MEDIUM,
            spin_snr_min=P.SPIN_SNR_MIN,
        )

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "ProcessorConfig":
        return cls(**d)


@dataclass
class ReplayResult:
    """One processor invocation's output, in a serializable form."""

    ball_speed_mph: float
    club_speed_mph: Optional[float]
    spin_rpm: Optional[float]
    spin_confidence: Optional[float]
    spin_snr: Optional[float]
    detected: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CaptureComparison:
    """Original-vs-replayed comparison for a single capture."""

    shot_number: int
    capture_line: int
    original: Optional[ReplayResult]
    replayed: ReplayResult

    @property
    def regression(self) -> bool:
        return bool(self.original and self.original.detected and not self.replayed.detected)

    @property
    def new_detection(self) -> bool:
        return bool(self.original and not self.original.detected and self.replayed.detected)

    def to_dict(self) -> dict:
        return {
            "shot_number": self.shot_number,
            "capture_line": self.capture_line,
            "original": self.original.to_dict() if self.original else None,
            "replayed": self.replayed.to_dict(),
            "regression": self.regression,
            "new_detection": self.new_detection,
        }


@dataclass
class SessionReport:
    """Per-session results."""

    source_path: str
    captures: list[CaptureComparison]
    stats: dict

    def to_dict(self) -> dict:
        return {
            "source_path": self.source_path,
            "captures": [c.to_dict() for c in self.captures],
            "stats": self.stats,
        }


@dataclass
class BatchReport:
    """Top-level replay output."""

    schema_version: int
    processor_config: ProcessorConfig
    sessions: list[SessionReport]
    aggregate: dict

    def to_dict(self) -> dict:
        return {
            "schema_version": self.schema_version,
            "processor_config": self.processor_config.to_dict(),
            "sessions": [s.to_dict() for s in self.sessions],
            "aggregate": self.aggregate,
        }
