# GSK-KILO Control Plane Lifecycle & Process Management

## 1. Process Ownership & Single-Instance Guarantee

The GSK-KILO Local Control Plane enforces a strict single-instance architecture:
$$\text{GSK-KILO Instances} \le 1 \quad \forall \text{ active development sessions}$$

### Invariant Guarantees
1. **Single OS Process**: At any given time, at most one Bun control-plane process runs on the host system.
2. **Deterministic Instance Discovery**: If a healthy instance is running on port 4380 (or an alternate port), subsequent executions of `gsk-kilo` or `bun src/index.js` immediately discover and reuse that instance without launching duplicate background processes.
3. **No Process Leaks**: Closing the web browser tab stops browser heartbeats. After a 60-second grace period (configurable via `GSK_KILO_IDLE_TIMEOUT`), the control-plane process auto-terminates gracefully.
4. **Targeted Process Management**: GSK-KILO never executes broad process killers like `pkill bun`, `pkill node`, or `pkill kilo`. Process management only targets validated GSK-KILO instances.
5. **Credential & State Invariant**: Stopping or exiting the control plane preserves all GenSpark auth tokens, Kilo configurations, SQLite database history, and logs intact.

---

## 2. Startup State Machine & Multi-Instance Detection

When `startServer()` is called, it executes the following state machine before creating any listening sockets:

```
                  +-----------------------------------+
                  |           START SERVER            |
                  +-----------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |     Scan Instance Registry        |
                  | ~/.config/kilo-genspark/instances |
                  +-----------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |        Probe Candidates           |
                  |  1. PID alive (kill 0)            |
                  |  2. /proc/pid/cmdline identity    |
                  |  3. GET /api/status HTTP probe    |
                  +-----------------------------------+
                                    |
            +-----------------------+-----------------------+
            |                                               |
  [ Valid Instance Found ]                        [ No Valid Instance ]
            |                                               |
            v                                               v
+-----------------------+                       +-----------------------+
| Deduplicate Extras:   |                       | Acquire Free Port     |
| Terminate duplicates  |                       | (4380 -> 4381 -> ...) |
| Keep newest instance  |                       +-----------------------+
+-----------------------+                                   |
            |                                               v
            v                                   +-----------------------+
+-----------------------+                       | Boot Fastify & SQLite |
| Return Reused Instance|                       +-----------------------+
| CLI exits 0 cleanly   |                                   |
+-----------------------+                                   v
                                                +-----------------------+
                                                | Register Instance     |
                                                | (0600 JSON in registry|
                                                +-----------------------+
                                                            |
                                                            v
                                                +-----------------------+
                                                | Arm 60s Idle Timer    |
                                                +-----------------------+
```

---

## 3. Instance Registry Specification

Active instances write metadata to `~/.config/kilo-genspark/instances/<instanceId>.json` and maintain a symlink/compatibility copy at `~/.config/kilo-genspark/instance.json`:

```json
{
  "instanceId": "gsk_inst_1788111904581_447228",
  "pid": 3042003,
  "host": "127.0.0.1",
  "port": 4380,
  "url": "http://127.0.0.1:4380",
  "startedAt": "2026-08-30T17:45:00.000Z",
  "version": "1.0.0"
}
```

* **File Permissions**: Stored under `0700` directory permissions with `0600` file permissions.
* **Non-Secret**: Never contains API keys, auth tokens, or session tokens.
* **Auto-Cleaning**: Unregistered cleanly on normal shutdown, and automatically purged by candidate validation upon host reboot or abrupt process termination.

---

## 4. Inactivity & Heartbeat Auto-Shutdown

```
+-------------------------------------------------------------------------------+
| Browser Tab (Open)        --> POST /api/heartbeat every 15s                   |
| Control Plane (Running)   --> Resets lastActivity timestamp                   |
|                                                                               |
| Browser Tab (Closed)      --> Heartbeats cease                                |
| Control Plane (Idle)      --> Inactivity check detects >60s since activity    |
|                               activeOperations === 0                          |
|                               Initiates ShutdownManager.shutdown()            |
+-------------------------------------------------------------------------------+
```

### Active Operations Guard
Auto-shutdown is suppressed whenever `activeOperations > 0`. Operations that increment the active guard counter include:
* GenSpark CLI Login / Logout flows (`POST /api/genspark/login`, `POST /api/genspark/logout`)
* Catalog & Model synchronization (`POST /api/genspark/sync`)
* Active Model Inference probes (`POST /api/health/active`)
* Diagnostic checks and installation tasks

---

## 5. Graceful Termination & Resource Cleanup (`ShutdownManager`)

Shutdown is orchestrated by `ShutdownManager`, which guarantees idempotent teardown:

1. **Signal Catching**: Listens for `SIGINT`, `SIGTERM`, idle timeouts, and `POST /api/control/stop`.
2. **Idempotency**: Atomic boolean check prevents multiple teardown attempts.
3. **Timer Clearance**: Cancels all heartbeat, polling, and catalog sync timers.
4. **Socket Drainage**: Closes Fastify HTTP server, waiting for existing in-flight connections to complete.
5. **Database Drainage**: Closes SQLite database connection cleanly in WAL mode.
6. **Registry Cleanup**: Removes instance registry file and unlinks `instance.json`.
7. **Timeout Safety**: 3-second fallback timer ensures the process never hangs indefinitely during teardown.

---

## 6. GUI Stop & Exit Controls

The dashboard provides a dedicated **CONTROL & LIFECYCLE** interface card:
* **Live Status Display**: Displays running status, current PID, bound Port, Instance ID, and engine runtime.
* **`[ 🛑 STOP SERVER ]`**: Sends `POST /api/control/stop` with `{ reason: "user_gui_stop" }`. The UI transitions smoothly to a "GSK-KILO Stopped" screen.
* **`[ 🚪 EXIT GSK-KILO ]`**: Initiates graceful shutdown and prompts user to close the browser tab.
* **Preservation Notice**: Informs the user that configuration, models, and credentials remain saved.
