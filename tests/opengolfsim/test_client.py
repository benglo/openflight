"""Tests for the OpenGolfSim TCP client."""

import json
import time
from datetime import datetime

from openflight.launch_monitor import ClubType, Shot
from openflight.opengolfsim.client import OpenGolfSimClient


def _shot(**kwargs) -> Shot:
    base = dict(
        ball_speed_mph=145.0,
        timestamp=datetime.now(),
        club=ClubType.DRIVER,
        launch_angle_vertical=12.0,
        launch_angle_horizontal=0.0,
        spin_rpm=2500,
        spin_axis_deg=0.0,
    )
    base.update(kwargs)
    return Shot(**base)


def _wait_until(predicate, timeout: float = 2.0, interval: float = 0.02) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def test_client_connects_and_sends_ready_status(mock_ogs_server):
    client = OpenGolfSimClient(host="127.0.0.1", port=mock_ogs_server.port)
    client.start()
    try:
        mock_ogs_server.wait_for_bytes(1)
        msgs = mock_ogs_server.received.decode("utf-8").strip().split("\n")
        decoded = [json.loads(line) for line in msgs if line]
        ready = [m for m in decoded if m.get("type") == "device" and m.get("status") == "ready"]
        assert ready, f"No ready status sent. Got: {decoded}"
    finally:
        client.stop()


def test_client_send_shot_writes_packet(mock_ogs_server):
    client = OpenGolfSimClient(host="127.0.0.1", port=mock_ogs_server.port)
    client.start()
    try:
        mock_ogs_server.wait_for_bytes(1)  # ready first
        assert _wait_until(lambda: client.is_connected, timeout=1.0)
        ok = client.send_shot(_shot())
        assert ok is True
        assert _wait_until(
            lambda: any(
                json.loads(line).get("type") == "shot"
                for line in mock_ogs_server.received.decode("utf-8").strip().split("\n")
                if line
            ),
            timeout=2.0,
        )
        decoded = [
            json.loads(line)
            for line in mock_ogs_server.received.decode("utf-8").strip().split("\n")
            if line
        ]
        shots = [m for m in decoded if m.get("type") == "shot"]
        assert len(shots) == 1
        assert shots[0]["shot"]["ballSpeed"] == 145.0
    finally:
        client.stop()


def test_client_send_shot_returns_false_when_disconnected():
    """No server -> connect fails -> send_shot returns False without raising."""
    # Port 1 is reserved (tcpmux); connection will be refused.
    client = OpenGolfSimClient(host="127.0.0.1", port=1)
    client.start()
    try:
        # Give the connect attempt a moment to fail.
        time.sleep(0.5)
        ok = client.send_shot(_shot())
        assert ok is False
    finally:
        client.stop()


def test_client_inbound_player_update_invokes_callback(mock_ogs_server):
    received = []
    client = OpenGolfSimClient(
        host="127.0.0.1", port=mock_ogs_server.port,
        on_player_update=lambda data: received.append(data),
    )
    client.start()
    try:
        mock_ogs_server.wait_for_bytes(1)
        mock_ogs_server.send_to_client(b'{"type":"player","data":{"club":{"id":"7I"}}}\n')
        assert _wait_until(lambda: bool(received), timeout=2.0), "Player update callback never fired"
        assert received[0]["club"]["id"] == "7I"
    finally:
        client.stop()


def test_client_inbound_result_invokes_callback(mock_ogs_server):
    received = []
    client = OpenGolfSimClient(
        host="127.0.0.1", port=mock_ogs_server.port,
        on_result=lambda data: received.append(data),
    )
    client.start()
    try:
        mock_ogs_server.wait_for_bytes(1)
        mock_ogs_server.send_to_client(
            b'{"type":"result","data":{"result":{"carry":250}}}\n'
        )
        assert _wait_until(lambda: bool(received), timeout=2.0), "Result callback never fired"
        assert received[0]["result"]["carry"] == 250
    finally:
        client.stop()


def test_client_handles_malformed_inbound_json(mock_ogs_server):
    received = []
    client = OpenGolfSimClient(
        host="127.0.0.1", port=mock_ogs_server.port,
        on_result=lambda data: received.append(data),
    )
    client.start()
    try:
        mock_ogs_server.wait_for_bytes(1)
        # Garbage line followed by a valid message — valid one must still arrive.
        mock_ogs_server.send_to_client(
            b'this is not json\n{"type":"result","data":{"result":{"carry":99}}}\n'
        )
        assert _wait_until(lambda: bool(received), timeout=2.0)
        assert received[0]["result"]["carry"] == 99
    finally:
        client.stop()


def test_client_reconnects_after_disconnect(mock_ogs_server):
    client = OpenGolfSimClient(
        host="127.0.0.1", port=mock_ogs_server.port,
        reconnect_initial_delay_s=0.1,
    )
    client.start()
    try:
        mock_ogs_server.wait_for_bytes(1)  # initial ready
        assert _wait_until(lambda: client.is_connected, timeout=1.0)
        mock_ogs_server.disconnect_client()
        # Wait for the client to notice and reconnect.
        assert _wait_until(lambda: not client.is_connected, timeout=2.0)
        assert _wait_until(lambda: client.is_connected, timeout=3.0)
        # After reconnect, sending a shot should succeed.
        ok = client.send_shot(_shot())
        assert ok is True
    finally:
        client.stop()


def test_client_stop_is_idempotent(mock_ogs_server):
    client = OpenGolfSimClient(host="127.0.0.1", port=mock_ogs_server.port)
    client.start()
    client.stop()
    client.stop()  # second call is a no-op, no error
