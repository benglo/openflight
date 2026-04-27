"""Load a session JSONL file and pair captures with their detected shots."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Union


@dataclass
class PairedCapture:
    """A rolling_buffer_capture entry plus the matching shot_detected, if any."""

    capture: dict
    shot: Optional[dict]
    line_number: int


def load_session(path: Union[Path, str]) -> list[PairedCapture]:
    """Read a session JSONL and return one PairedCapture per rolling_buffer_capture entry.

    Pairing is by ``shot_number``. If multiple shot_detected entries share a
    shot_number (the logger does not write duplicates, but we tolerate it
    defensively), the first one wins. Captures with no matching shot_detected
    get ``shot=None``.

    Missing files return an empty list rather than raising; callers operating
    on directories of session files benefit from this leniency.
    """
    path = Path(path)
    if not path.is_file():
        return []

    captures: list[tuple[int, dict]] = []
    shots_by_number: dict[int, dict] = {}

    with path.open("r", encoding="utf-8") as f:
        for line_no, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            etype = entry.get("type")
            if etype == "rolling_buffer_capture":
                captures.append((line_no, entry))
            elif etype == "shot_detected":
                num = entry.get("shot_number")
                if num is not None and num not in shots_by_number:
                    shots_by_number[num] = entry

    paired: list[PairedCapture] = []
    for line_no, capture in captures:
        num = capture.get("shot_number")
        shot = shots_by_number.get(num) if num is not None else None
        paired.append(PairedCapture(capture=capture, shot=shot, line_number=line_no))
    return paired
