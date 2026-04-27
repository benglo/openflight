"""OpenGolfSim TCP wire protocol — constants and JSON line encoding.

Reference: https://help.opengolfsim.com/desktop/apis/
"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger(__name__)

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 3111

# Shot field bounds per the OpenGolfSim docs.
MIN_VERTICAL_DEG = 0.0
MAX_VERTICAL_DEG = 45.0
MIN_HORIZONTAL_DEG = -45.0
MAX_HORIZONTAL_DEG = 45.0
MIN_SPIN_AXIS_DEG = -45.0
MAX_SPIN_AXIS_DEG = 45.0

# Outbound message types (launch monitor -> sim).
MSG_TYPE_SHOT = "shot"
MSG_TYPE_DEVICE = "device"

# Inbound message types (sim -> launch monitor).
MSG_TYPE_PLAYER = "player"
MSG_TYPE_RESULT = "result"

# Device status values.
DEVICE_STATUS_READY = "ready"
DEVICE_STATUS_BUSY = "busy"

# Imperial / metric flag for the outbound `unit` field.
UNIT_IMPERIAL = "imperial"
UNIT_METRIC = "metric"


def encode_message(payload: dict) -> bytes:
    """Serialize a payload into the JSON-line wire format."""
    return (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")


def decode_message(raw: bytes) -> dict:
    """Parse a single JSON line; trailing newline is tolerated."""
    text = raw.decode("utf-8").rstrip("\n").strip()
    return json.loads(text)


def decode_lines(buf: bytes) -> tuple[list[dict], bytes]:
    """Split a buffer on newlines, JSON-parse each complete line.

    Returns ``(list_of_messages, remaining_bytes)``. Malformed lines are
    skipped with a WARNING — they don't poison the stream.
    """
    messages: list[dict] = []
    *complete, leftover = buf.split(b"\n")
    for line in complete:
        line = line.strip()
        if not line:
            continue
        try:
            messages.append(json.loads(line))
        except json.JSONDecodeError:
            logger.warning("[OPENGOLFSIM] Dropping malformed inbound line: %r", line[:200])
    return messages, leftover
