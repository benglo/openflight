# OpenGolfSim Integration

Forward detected shots from OpenFlight to a running [OpenGolfSim](https://opengolfsim.com/)
desktop instance over TCP, and surface OpenGolfSim's player/club updates
and shot results back into the OpenFlight UI.

Once enabled, OpenFlight functions as a real launch monitor for OpenGolfSim
— hit a ball, the radar measures it, and the sim renders ball flight on
the course you're playing.

## Quick start

1. Start OpenGolfSim and open a round (or anything that activates the
   launch-monitor TCP listener on port 3111).
2. Run OpenFlight with the `--opengolfsim` flag:
   ```bash
   scripts/start-kiosk.sh --opengolfsim
   ```
   Or for development without hardware:
   ```bash
   uv run python -m openflight.server --mock --opengolfsim
   ```
3. Hit a shot (or use the simulate-shot button in mock mode). It should
   appear in OpenGolfSim within milliseconds.

## CLI flags

| Flag | Default | Purpose |
|---|---|---|
| `--opengolfsim` | off | Enable the integration |
| `--opengolfsim-host` | `127.0.0.1` | OpenGolfSim host (use the LAN IP for multi-machine setups) |
| `--opengolfsim-port` | `3111` | TCP port — the value documented in the OpenGolfSim API docs |

## What flows where

```
                 ┌─────────────┐  shot detected   ┌─────────────────┐
   radar /       │  OpenFlight │ ───────────────▶ │ shot_to_packet  │
   mock mode     │   server    │                  │  (clamp + fill) │
                 └─────────────┘                  └────────┬────────┘
                       ▲                                   │
                       │  player / result events           │ {"type":"shot",...}
                       │                                   ▼
                 ┌─────────────┐                  ┌─────────────────┐
                 │  React UI   │ ◀──── socket ────│ TCP / port 3111 │ ────▶ OpenGolfSim
                 └─────────────┘   .io events     └─────────────────┘
```

### Outbound — shot packets

Five required fields, mapped from the `Shot` dataclass:

| Wire field | Source `Shot` attribute | Default if missing |
|---|---|---|
| `ballSpeed` | `ball_speed_mph` (mph) or `* 0.44704` (m/s) | required — radar always provides |
| `verticalLaunchAngle` | `launch_angle_vertical` | `0.0` (clamped to [0, 45]) |
| `horizontalLaunchAngle` | `launch_angle_horizontal` | `0.0` (clamped to [-45, 45]) |
| `spinSpeed` | `spin_rpm` | `get_optimal_spin_for_ball_speed(ball_speed, club)` if `None` or `0` |
| `spinAxis` | `spin_axis_deg` | `0.0` (clamped to [-45, 45]) |

Out-of-range values are clamped silently with an INFO-level log message
(e.g. a 60° launch angle becomes 45°). The shot is not dropped — the user
gets a usable simulation rather than a silent failure.

The `unit` field defaults to `imperial`. Pass `unit="metric"` to
`shot_to_packet()` programmatically if you want SI units.

### Inbound — player updates

When OpenGolfSim sends a `{"type":"player","data":{"club":{"id":"7I"}}}`
message:

- The handler maps `id` to OpenFlight's `ClubType` enum
- `state.monitor.set_club(club)` updates the active club
- `socketio.emit("club_changed", {"club": "7-iron"})` updates the UI

Unknown club ids are logged at WARNING level and OpenFlight's selection
is left unchanged.

### Inbound — shot results

When OpenGolfSim sends a `{"type":"result","data":{"result":{"carry":...,
"height":..., "roll":..., "total":..., "lateral":...}}}` message, the
data is forwarded to the React UI as a Socket.IO `opengolfsim_result`
event. Frontend components can opt to display the simulator's carry
instead of OpenFlight's estimate. (UI changes are tracked separately.)

## Robustness

- **Connection refused** (OpenGolfSim not running): logged at WARNING,
  the launch monitor still runs. The client retries with exponential
  backoff (1s, 2s, 4s, … capped at 30s). When OpenGolfSim eventually
  starts, the client connects automatically.
- **Mid-session disconnect**: detected via socket EOF or send failure.
  The reconnect loop kicks in. Shots arriving during the disconnect
  window are dropped with a WARNING; OpenFlight's UI still shows them.
- **Malformed inbound JSON**: skipped with a WARNING. Subsequent valid
  lines continue to be processed.
- **Concurrent shots** (rapid-fire mock mode, etc.): queued FIFO into
  the writer thread. Never dropped due to thread contention.
- **Process shutdown**: `Ctrl+C` cleanly closes the socket and joins
  both threads within 2 seconds.

## Limitations

- **No authentication**: OpenGolfSim's API has no auth or pairing. Run
  on a trusted network only. (The default `127.0.0.1` keeps traffic
  on localhost.)
- **Device status is informational only**: we send `ready` on connect
  but don't toggle `busy`/`ready` per shot. OpenGolfSim doesn't appear
  to require it.
- **No shot result → carry display yet**: the inbound `result` event
  is emitted to the UI but the React app doesn't render it. Wiring it
  into the shot card so the simulator's carry replaces OpenFlight's
  estimate is a follow-up.
- **No error responses from sim**: the OpenGolfSim API doesn't document
  any error/NACK format. If the sim rejects a packet, we don't know.

## Reference

- [OpenGolfSim Developer API](https://help.opengolfsim.com/desktop/apis/) — upstream protocol docs
- `src/openflight/opengolfsim/` — implementation
- `tests/opengolfsim/` — protocol, adapter, and client tests
