"""Mock TCP server fixture used to test the OpenGolfSim client.

Spins up a localhost TCP listener on a random port; collects bytes received
from clients and exposes a way to inject inbound messages.
"""

from __future__ import annotations

import socket
import threading
import time

import pytest


class MockOpenGolfSimServer:
    def __init__(self):
        self.host = "127.0.0.1"
        self.port: int = 0
        self._sock: socket.socket | None = None
        self._client_sock: socket.socket | None = None
        self._accept_thread: threading.Thread | None = None
        self._reader_thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._received = bytearray()
        self._lock = threading.Lock()

    def start(self) -> None:
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((self.host, 0))
        self._sock.listen(1)
        self.port = self._sock.getsockname()[1]
        self._accept_thread = threading.Thread(
            target=self._accept_loop, daemon=True, name="mock-ogs-accept",
        )
        self._accept_thread.start()

    def _accept_loop(self) -> None:
        self._sock.settimeout(0.5)
        while not self._stop.is_set():
            try:
                cli, _ = self._sock.accept()
            except (socket.timeout, OSError):
                continue
            self._client_sock = cli
            self._reader_thread = threading.Thread(
                target=self._read_loop, args=(cli,), daemon=True, name="mock-ogs-read",
            )
            self._reader_thread.start()

    def _read_loop(self, cli: socket.socket) -> None:
        cli.settimeout(0.5)
        try:
            while not self._stop.is_set():
                try:
                    chunk = cli.recv(4096)
                except socket.timeout:
                    continue
                except OSError:
                    return
                if not chunk:
                    return
                with self._lock:
                    self._received.extend(chunk)
        finally:
            try:
                cli.close()
            except OSError:
                pass

    def send_to_client(self, payload: bytes) -> None:
        if self._client_sock is None:
            raise RuntimeError("No client connected yet")
        self._client_sock.sendall(payload)

    def disconnect_client(self) -> None:
        if self._client_sock is not None:
            try:
                self._client_sock.shutdown(socket.SHUT_RDWR)
                self._client_sock.close()
            except OSError:
                pass
            self._client_sock = None

    @property
    def received(self) -> bytes:
        with self._lock:
            return bytes(self._received)

    def wait_for_bytes(self, n: int, timeout: float = 2.0) -> bytes:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if len(self.received) >= n:
                return self.received
            time.sleep(0.02)
        raise TimeoutError(
            f"Did not receive {n} bytes within {timeout}s; got {len(self.received)}"
        )

    def stop(self) -> None:
        self._stop.set()
        try:
            if self._sock is not None:
                self._sock.close()
        except OSError:
            pass
        if self._client_sock is not None:
            try:
                self._client_sock.close()
            except OSError:
                pass
        if self._accept_thread is not None:
            self._accept_thread.join(timeout=1.0)


@pytest.fixture
def mock_ogs_server():
    server = MockOpenGolfSimServer()
    server.start()
    try:
        yield server
    finally:
        server.stop()
