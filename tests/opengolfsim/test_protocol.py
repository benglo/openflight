"""Tests for the OpenGolfSim wire protocol module."""

import json

from openflight.opengolfsim.protocol import (
    DEFAULT_PORT,
    DEVICE_STATUS_BUSY,
    DEVICE_STATUS_READY,
    MAX_HORIZONTAL_DEG,
    MAX_SPIN_AXIS_DEG,
    MAX_VERTICAL_DEG,
    MIN_HORIZONTAL_DEG,
    MIN_SPIN_AXIS_DEG,
    MIN_VERTICAL_DEG,
    decode_lines,
    decode_message,
    encode_message,
)


def test_default_port_matches_documentation():
    assert DEFAULT_PORT == 3111


def test_documented_ranges():
    assert (MIN_VERTICAL_DEG, MAX_VERTICAL_DEG) == (0.0, 45.0)
    assert (MIN_HORIZONTAL_DEG, MAX_HORIZONTAL_DEG) == (-45.0, 45.0)
    assert (MIN_SPIN_AXIS_DEG, MAX_SPIN_AXIS_DEG) == (-45.0, 45.0)


def test_encode_message_appends_newline():
    payload = {"type": "device", "status": "ready"}
    raw = encode_message(payload)
    assert raw.endswith(b"\n")
    assert json.loads(raw[:-1]) == payload


def test_decode_message_parses_shot_payload():
    raw = b'{"type":"shot","shot":{"ballSpeed":140}}\n'
    msg = decode_message(raw)
    assert msg["type"] == "shot"
    assert msg["shot"]["ballSpeed"] == 140


def test_decode_lines_yields_one_message_per_newline():
    buf = b'{"type":"a"}\n{"type":"b"}\nincomplete'
    out, leftover = decode_lines(buf)
    assert [m["type"] for m in out] == ["a", "b"]
    assert leftover == b"incomplete"


def test_decode_lines_skips_malformed_json():
    buf = b'{"type":"a"}\nnot json\n{"type":"b"}\n'
    out, leftover = decode_lines(buf)
    assert [m["type"] for m in out] == ["a", "b"]
    assert leftover == b""


def test_device_status_constants():
    assert DEVICE_STATUS_READY == "ready"
    assert DEVICE_STATUS_BUSY == "busy"
