# GSK-KILO Control Plane Core Documentation

**Document Version:** 1.1.0 (Bun 1.4 Runtime Pivot)  
**Status:** Completed Phase 4B-1R Implementation  
**Component:** `GSK-KILO Local Control Plane Core & Lifecycle Services`  
**Classification:** Internal Technical Documentation  

---

## 1. Architecture Implemented

The **GSK-KILO Control Plane Core** provides local observability, diagnostics, and management of the GenSpark ↔ Kilo Code bridge powered by **Bun 1.4**.

```text
┌───────────────────────────────────────────────────────────────────┐
│                    GSK-KILO CONTROL PLANE CORE                    │
│                      http://127.0.0.1:<port>                      │
├───────────────────────────────────────────────────────────────────┤
│  • Bun 1.4 Runtime + Fastify Local Server (127.0.0.1 Only)        │
│  • Native bun:sqlite Persistence (WAL Mode, 0600 Permissions)     │
│  • Dynamic Port Discovery (4380 → 4381... Collision Fallback)    │
│  • Single-Instance Deduplication & Stale Lock Recovery Engine     │
│  • Idle Lifecycle Manager (10-min Timeout + Browser Heartbeat)    │
│  • Cross-Platform Browser Launcher (xdg-open / open / start)      │
│  • Safe Process Execution Abstraction (Bun.which / Bun.spawn)    │
└───────────────────────────────────────────────────────────────────┘
```

---

## 2. Project Structure

```text
$REPO_ROOT/
├── package.json                     # Bun project configuration & scripts
├── bun.lock                         # Bun native binary lockfile
├── dist/
│   └── gsk-kilo-control-plane       # Standalone compiled executable (bun build --compile)
├── src/
│   ├── index.js                     # Entrypoint exporting all services
│   ├── config/
│   │   └── paths.js                 # Runtime paths, lock file, and PATH resolution
│   ├── db/
│   │   ├── database.js              # bun:sqlite connection manager
│   │   ├── migrations.js            # Versioned migration manager
│   │   └── schema.sql               # SQLite DDL schema (9 core tables + indexes)
│   ├── services/
│   │   ├── port_manager.js          # Dynamic port selection and collision avoidance
│   │   ├── instance_lock.js         # Single instance lock and deduplication
│   │   ├── lifecycle_manager.js     # Idle timeout and heartbeat tracking
│   │   └── browser_launcher.js      # Cross-platform browser opener
│   ├── server/
│   │   ├── app.js                   # Fastify factory with security hooks & error handler
│   │   ├── server.js                # Server bootstrap & graceful signal handlers
│   │   └── routes/
│   │       ├── root.js              # GET / landing page with heartbeat JS
│   │       ├── status.js            # GET /api/status endpoint
│   │       ├── system.js            # GET /api/system endpoint
│   │       ├── health.js            # GET /api/health endpoint
│   │       └── heartbeat.js         # POST /api/heartbeat endpoint
│   └── utils/
│       ├── command_runner.js        # Bun.which & Bun.spawn execution abstraction
│       ├── logger.js                # Redacted structured logger
│       └── sanitize.js              # Secret pattern masking utility
├── test/
│   ├── control_plane.test.js        # Unit and edge-case test suite (bun test)
│   └── e2e_verification.js          # 24-step complete E2E test script
└── docs/
    ├── GSK_KILO_CONTROL_PLANE_ARCHITECTURE.md
    ├── GSK_KILO_CONTROL_PLANE_CORE.md
    └── GSK_KILO_BUN_RUNTIME.md
```

---

## 3. Runtime & Storage Locations

| Resource | Path | Permissions | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime Directory** | `~/.config/kilo-genspark/` | `0700` (`rwx------`) | Isolated root for all runtime files |
| **Control DB** | `~/.config/kilo-genspark/control.db` | `0600` (`rw-------`) | SQLite database file (`bun:sqlite`) |
| **Instance Lock** | `~/.config/kilo-genspark/instance.json` | `0600` (`rw-------`) | Active process PID and port lock |
| **Kilo Runtime Config** | `~/.config/kilo-genspark/kilo/kilo.json` | `0600` (`rw-------`) | Isolated Kilo OpenCode provider configuration |
| **GenSpark CLI Creds** | `~/.genspark-tool-cli/config.json` | `0600` (`rw-------`) | Official GenSpark CLI auth token store |

---

## 4. REST API Specifications

* **`GET /`**: Serves minimal HTML status page with real-time heartbeat script.
* **`GET /api/status`**: Returns application status, version, uptime, runtime engine (`bun`), dashboard URL, and lifecycle info.
* **`GET /api/system`**: Returns host OS, Node, npm, Bun, GenSpark CLI, and Kilo CLI versions without leaking any secrets.
* **`GET /api/health`**: Returns `{ status: "healthy", database: "ok", server: "ok", engine: "bun" }`.
* **`POST /api/heartbeat`**: Registers browser presence, resetting idle auto-shutdown timer.

---

## 5. Startup Commands & Environment Variables

```bash
# Start server with Bun
bun src/index.js

# Start server and auto-open browser
bun src/index.js --open

# Run unit and edge-case tests
bun test

# Run full 24-step E2E verification
bun test/e2e_verification.js

# Compile standalone single-file binary
bun run build
```

### Environment Variables
* `GSK_KILO_PORT`: Preferred starting port (default: `4380`).
* `GSK_KILO_IDLE_TIMEOUT`: Auto-shutdown idle timeout in seconds (default: `600`, `0` to disable).
* `GSK_KILO_RUNTIME_DIR`: Custom runtime directory (default: `~/.config/kilo-genspark`).
* `GSK_KILO_DB_PATH`: Custom SQLite database path.
* `GSK_KILO_LOG_LEVEL`: Log verbosity (`debug`, `info`, `warn`, `error`).
