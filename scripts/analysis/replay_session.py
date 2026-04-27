#!/usr/bin/env python3
"""Replay one or more session JSONL files through the rolling buffer pipeline.

Produces a stable JSON report (schema v1) with per-capture comparisons and
aggregate statistics, suitable for regression testing and feeding downstream
tools (ballistic carry model, spin-detection tuning).

Usage:
    replay_session.py SESSION_FILE_OR_DIR [--output REPORT.json] [--summary]
                                          [--processor-config CFG.json]

Distinct from scripts/analysis/replay_captures.py, which is a per-capture
FFT debugger. This tool is the corpus-level harness for batch comparisons.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure src/ is importable when running directly from a repo checkout.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT / "src"))

from openflight.replay.aggregate import (  # noqa: E402
    compute_batch_aggregate,
    compute_session_stats,
)
from openflight.replay.engine import build_batch_report, replay_session  # noqa: E402
from openflight.replay.loader import load_session  # noqa: E402
from openflight.replay.types import ProcessorConfig, SessionReport  # noqa: E402


def _gather_paths(target: Path) -> list[Path]:
    if target.is_file():
        return [target]
    if target.is_dir():
        return sorted(target.glob("session_*.jsonl"))
    raise FileNotFoundError(target)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "target", help="Session JSONL file or directory containing session_*.jsonl"
    )
    parser.add_argument("--output", help="Write the full JSON report to this path")
    parser.add_argument(
        "--summary", action="store_true", help="Print aggregate stats to stdout"
    )
    parser.add_argument(
        "--processor-config",
        help=(
            "Path to JSON file overriding ProcessorConfig fields. "
            "v1 records the override in the report fingerprint but does "
            "not yet feed it back into the live processor."
        ),
    )
    args = parser.parse_args(argv)

    target = Path(args.target)
    try:
        paths = _gather_paths(target)
    except FileNotFoundError:
        print(f"No such target: {target}", file=sys.stderr)
        return 2

    if not paths:
        print(f"No session files found at {target}", file=sys.stderr)
        return 2

    cfg = ProcessorConfig.default()
    if args.processor_config:
        with open(args.processor_config) as f:
            overrides = json.load(f)
        merged = cfg.to_dict()
        merged.update(overrides)
        cfg = ProcessorConfig.from_dict(merged)

    session_reports: list[SessionReport] = []
    per_session_stats: list[dict] = []
    for path in paths:
        pairs = load_session(path)
        comparisons = replay_session(pairs)
        stats = compute_session_stats(comparisons)
        per_session_stats.append(stats)
        session_reports.append(
            SessionReport(source_path=str(path), captures=comparisons, stats=stats)
        )

    aggregate = compute_batch_aggregate(per_session_stats)
    report = build_batch_report(session_reports, processor_config=cfg, aggregate=aggregate)
    payload = report.to_dict()

    if args.output:
        Path(args.output).write_text(json.dumps(payload, indent=2))

    if args.summary or not args.output:
        print(json.dumps(aggregate, indent=2))

    return 0


if __name__ == "__main__":
    sys.exit(main())
