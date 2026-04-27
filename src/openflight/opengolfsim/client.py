"""TCP client for OpenGolfSim with reconnect and inbound dispatch.

Threading model:
  - One supervisor thread handles connect / reconnect with exponential backoff.
  - One writer thread drains a queue of outbound packets to the socket.
  - One reader thread (per active connection) reads lines from the socket
    and dispatches inbound messages to user-provided callbacks.

Design choice: shots are NOT enqueued while disconnected. A missed shot is
preferable to a stale shot arriving in the simulator after the user has
already moved on to the next swing.
"""

from __future__ import annotations

import logging
import queue
import socket
import threading
import time
from typing import Callable, Optional

from openflight.launch_monitor import Shot

from .adapter import shot_to_packet
from .protocol import (
    DEFAULT_HOST,
    DEFAULT_PORT,
    DEVICE_STATUS_READY,
    MSG_TYPE_DEVICE,
    MSG_TYPE_PLAYER,
    MSG_TYPE_RESULT,
    decode_lines,
    encode_message,
)

logger = logging.getLogger(__name__)

_CallbackT = Optional[Callable[[dict], None]]


class OpenGolfSimClient:
    """TCP client that forwards shots to OpenGolfSim and dispatches inbound events."""

    def __init__(
        self,
        host: str = DEFAULT_HOST,
        port: int = DEFAULT_PORT,
        *,
        on_player_update: _CallbackT = None,
        on_result: _CallbackT = None,
        on_status_change: Optional[Callable[[bool], None]] = None,
        reconnect_initial_delay_s: float = 1.0,
        reconnect_max_delay_s: float = 30.0,
    ):
        self._host = host
        self._port = port
        self._on_player_update = on_player_update
        self._on_result = on_result
        self._on_status_change = on_status_change
        self._reconnect_initial = reconnect_initial_delay_s
        self._reconnect_max = reconnect_max_delay_s

        self._stop = threading.Event()
        self._connected = threading.Event()
        self._sock: Optional[socket.socket] = None
        self._sock_lock = threading.Lock()
        self._send_queue: queue.Queue = queue.Queue()
        self._supervisor: Optional[threading.Thread] = None
        self._writer: Optional[threading.Thread] = None
        self._reader: Optional[threading.Thread] = None

    # --- Public API ---

    def start(self) -> None:
        """Spawn the supervisor and writer threads."""
        if self._supervisor is not None:
            return
        self._supervisor = threading.Thread(
            target=self._supervisor_loop, daemon=True, name="ogs-supervisor",
        )
        self._supervisor.start()
        self._writer = threading.Thread(
            target=self._writer_loop, daemon=True, name="ogs-writer",
        )
        self._writer.start()

    def stop(self) -> None:
        """Cleanly stop all threads and close the socket. Idempotent."""
        if self._stop.is_set():
            return
        self._stop.set()
        # Unblock the writer queue.
        try:
            self._send_queue.put_nowait(b"")
        except queue.Full:  # pragma: no cover — unbounded queue
            pass
        with self._sock_lock:
            if self._sock is not None:
                try:
                    self._sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                try:
                    self._sock.close()
                except OSError:
                    pass
                self._sock = None
        for thread in (self._supervisor, self._writer, self._reader):
            if thread is not None:
                thread.join(timeout=2.0)

    def send_shot(self, shot: Shot, *, unit: str = "imperial") -> bool:
        """Forward a shot to the simulator. Returns False if disconnected."""
        if not self._connected.is_set():
            logger.warning("[OPENGOLFSIM] Drop shot: client not connected")
            return False
        try:
            packet = shot_to_packet(shot, unit=unit)
        except (ValueError, TypeError) as e:
            logger.error("[OPENGOLFSIM] Failed to build shot packet: %s", e)
            return False
        self._send_queue.put(encode_message(packet))
        return True

    @property
    def is_connected(self) -> bool:
        return self._connected.is_set()

    # --- Internals ---

    def _supervisor_loop(self) -> None:
        delay = self._reconnect_initial
        while not self._stop.is_set():
            try:
                self._connect_once()
                delay = self._reconnect_initial  # reset on successful connect
                # Block until the reader exits or stop is requested.
                while not self._stop.is_set() and self._connected.is_set():
                    time.sleep(0.1)
            except (OSError, ConnectionError) as e:
                logger.warning(
                    "[OPENGOLFSIM] Connect to %s:%d failed: %s; retrying in %.1fs",
                    self._host, self._port, e, delay,
                )
                self._wait_for_reconnect(delay)
                delay = min(delay * 2, self._reconnect_max)

    def _wait_for_reconnect(self, delay: float) -> None:
        end = time.time() + delay
        while time.time() < end:
            if self._stop.is_set():
                return
            time.sleep(0.1)

    def _connect_once(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5.0)
        sock.connect((self._host, self._port))
        sock.settimeout(None)
        with self._sock_lock:
            self._sock = sock
        self._connected.set()
        if self._on_status_change is not None:
            try:
                self._on_status_change(True)
            except Exception:  # pragma: no cover — defensive
                logger.exception("[OPENGOLFSIM] on_status_change callback raised")
        logger.info("[OPENGOLFSIM] Connected to %s:%d", self._host, self._port)
        # Send initial ready status per the docs.
        self._send_queue.put(
            encode_message({"type": MSG_TYPE_DEVICE, "status": DEVICE_STATUS_READY})
        )
        # Start a fresh reader for this connection.
        self._reader = threading.Thread(
            target=self._reader_loop, args=(sock,), daemon=True, name="ogs-reader",
        )
        self._reader.start()

    def _reader_loop(self, sock: socket.socket) -> None:
        buf = b""
        try:
            while not self._stop.is_set():
                try:
                    chunk = sock.recv(4096)
                except OSError:
                    break
                if not chunk:
                    logger.info("[OPENGOLFSIM] Server closed connection")
                    break
                buf += chunk
                messages, buf = decode_lines(buf)
                for msg in messages:
                    self._dispatch(msg)
        finally:
            self._on_disconnect()

    def _dispatch(self, msg: dict) -> None:
        msg_type = msg.get("type")
        data = msg.get("data", {})
        if msg_type == MSG_TYPE_PLAYER and self._on_player_update is not None:
            try:
                self._on_player_update(data)
            except Exception:  # pragma: no cover — user callback
                logger.exception("[OPENGOLFSIM] on_player_update raised")
        elif msg_type == MSG_TYPE_RESULT and self._on_result is not None:
            try:
                self._on_result(data)
            except Exception:  # pragma: no cover — user callback
                logger.exception("[OPENGOLFSIM] on_result raised")
        else:
            logger.debug("[OPENGOLFSIM] Unhandled message type %r", msg_type)

    def _on_disconnect(self) -> None:
        self._connected.clear()
        if self._on_status_change is not None:
            try:
                self._on_status_change(False)
            except Exception:  # pragma: no cover
                logger.exception("[OPENGOLFSIM] on_status_change callback raised")
        with self._sock_lock:
            if self._sock is not None:
                try:
                    self._sock.close()
                except OSError:
                    pass
                self._sock = None

    def _writer_loop(self) -> None:
        while not self._stop.is_set():
            try:
                payload = self._send_queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if not payload:
                continue  # sentinel — wakes the loop on stop
            with self._sock_lock:
                sock = self._sock
            if sock is None:
                # Disconnected — drop. send_shot already gates this so we
                # only reach here for stale queue items.
                continue
            try:
                sock.sendall(payload)
            except OSError as e:
                logger.warning("[OPENGOLFSIM] Send failed: %s", e)
                self._on_disconnect()


__all__ = ["OpenGolfSimClient"]
