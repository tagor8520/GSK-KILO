# GSK-KILO Control Plane — Bun 1.4 Runtime Specification

**Document Version:** 1.0.0  
**Target Release:** Bun 1.4.0 (`bun:sqlite`, `Bun.spawn`, `Bun.which`, `bun test`)  
**Component:** `GSK-KILO Local Control Plane Core & Lifecycle Engine`  
**Classification:** Internal Technical Architecture & Runtime Documentation  

---

## 1. Executive Summary & Runtime Pivot Rationale

In Phase 4B-1R, the **GSK-KILO Local Control Plane** transitioned its runtime engine from Node.js to **Bun 1.4.0**.

### Key Advantages:
1. **Zero-Dependency Native SQLite (`bun:sqlite`)**: High-performance native C-level SQLite engine with zero build steps or native compilation toolchain requirements.
2. **Sub-30ms Boot Time**: Control plane starts and becomes healthy on localhost in ~27ms.
3. **Built-in Process Runner (`Bun.spawn` & `Bun.which`)**: Safe argv-array execution with automatic process tracking and timeout enforcement without shell interpolation risks.
4. **Native Test Runner (`bun test`)**: Comprehensive unit and edge-case execution in ~11s without additional test packages.
5. **Standalone Compilation Target**: Capable of single-binary zero-dependency compilation via `bun build --compile`.

---

## 2. Runtime Topology

The architecture maintains an intentional separation between the Bun-powered control plane and the Node-powered external CLI tools:

```text
                     GSK-KILO
                        │
                  ┌─────▼─────┐
                  │  Bun 1.4  │
                  │  Control  │
                  │   Plane   │
                  └─────┬─────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
     SQLite            gsk            kilo
  (bun:sqlite)      (Node CLI)     (Node CLI)
```

> [!IMPORTANT]
> **Critical Network Invariant:**
> The dashboard port (e.g. `4380`, `4381`, `4387`) is **strictly independent** of the upstream GenSpark provider endpoint.
> Kilo Code communicates directly with GenSpark's official HTTPS proxy (`https://www.genspark.ai/api/llm_proxy/v1`).
> The control plane never acts as an LLM reverse proxy and never rewrites Kilo's provider `baseURL` to localhost.

---

## 3. Core Subsystems

### 3.1 SQLite Persistence (`src/db/database.js`)
* **Engine**: `bun:sqlite` (`import { Database } from 'bun:sqlite'`).
* **Path**: `~/.config/kilo-genspark/control.db` (mode `0600`).
* **Pragmas**: WAL journal mode (`PRAGMA journal_mode = WAL;`), Foreign Keys enabled (`PRAGMA foreign_keys = ON;`).
* **Compatibility**: Directly opens database files created under Node without schema changes.

### 3.2 Process Execution Abstraction (`src/utils/command_runner.js`)
* **Resolution**: `CommandRunner.which(binaryName)` searches `RESOLVED_PATH` (`~/.bun/bin`, `~/.npm-global/bin`, `/usr/local/bin`, `/usr/bin`, `/bin`).
* **Execution**: `CommandRunner.run(binaryName, args, options)` spawns via `Bun.spawn` with timeout enforcement, clean kill signals (`SIGKILL`), and regex-based output sanitization.

### 3.3 Dynamic Port Manager (`src/services/port_manager.js`)
* **Default Port**: `4380` (overrideable via `GSK_KILO_PORT`).
* **Collision Behavior**: If 4380 is occupied, sequentially tests `4381, 4382...` up to 50 attempts or falls back to an ephemeral port.
* **Status Reporting**: Actual discovered host, port, and URL are returned in `GET /api/status`.

### 3.4 Single Instance Lock (`src/services/instance_lock.js`)
* **Lock File**: `~/.config/kilo-genspark/instance.json` (mode `0600`).
* **Deduplication**: If a secondary launch occurs while a healthy control plane is active, the second process retrieves the existing dashboard URL, launches the browser, and cleanly terminates without creating duplicate servers.
* **Stale Lock Recovery**: Automatically verifies PID liveness and probes `/api/health`. Dead locks are purged automatically.

### 3.5 Lifecycle & Heartbeat Engine (`src/services/lifecycle_manager.js`)
* **Idle Timeout**: Defaults to 600s (10 min), configurable via `GSK_KILO_IDLE_TIMEOUT` (`0` disables).
* **Browser Heartbeat**: Dashboard web page pings `POST /api/heartbeat` every 15 seconds.
* **Shutdown Condition**: Clean auto-shutdown occurs only when:
  $$\text{idleDuration} \ge \text{idleLimit} \quad \land \quad \text{activeOperations} = 0 \quad \land \quad \text{activeChildProcesses} = 0$$

### 3.6 Cross-Platform Browser Launcher (`src/services/browser_launcher.js`)
* **Linux**: `xdg-open`
* **macOS**: `open`
* **Windows**: `cmd.exe /c start`
* **Degradation**: If browser launcher is missing, prints the URL cleanly to stdout without failing.

---

## 4. End-to-End Test Results (24 Steps)

| Step | Operation | Result |
| :--- | :--- | :--- |
| **1** | Stop existing control plane & clear locks | `PASS` |
| **2-5** | Start Bun control plane on 4380 with 3s idle limit | `PASS` (Started in 27ms) |
| **6** | `GET /` root dashboard landing page | `PASS` (HTTP 200) |
| **7** | `GET /api/status` returns metadata | `PASS` (`runtime: bun`) |
| **8** | `GET /api/system` returns safe environment | `PASS` (`gsk: 1.7.1`, `kilo: 7.2.0`) |
| **9** | `GET /api/health` checks SQLite & server | `PASS` (`database: ok`) |
| **10** | Verify GenSpark Plus auth presence | `PASS` (`installed: true`) |
| **11** | Verify Kilo CLI presence | `PASS` (`installed: true`) |
| **12** | Verify model catalog deferred to Phase 4B-2 | `PASS` |
| **13-15** | Dashboard closed; auto-shutdown after 3s idle | `PASS` (Exited with code 0) |
| **16-17** | Relaunch Bun control plane cleanly | `PASS` (Idempotent restart) |
| **18-21** | Simulate 4380 collision; verify 4381 fallback | `PASS` (Bound to 4381 automatically) |
| **22** | Check Kilo `baseURL` invariant | `PASS` (`https://www.genspark.ai/api/llm_proxy/v1`) |
| **23-24** | Harmless live model request via launcher | `PASS` (`POST_MIGRATION_E2E_OK`) |

---

## 5. Measured Resource Footprint

| Metric | Node.js Baseline | Bun 1.4 Runtime | Standalone Binary |
| :--- | :--- | :--- | :--- |
| **Startup Latency** | ~110 ms | **~27 ms** | **~24 ms** |
| **Idle RSS Memory** | ~42 MB | **~55 MB** | **~54 MB** |
| **Database Size** | 104 KB | **104 KB** | 104 KB |
| **`node_modules`** | 15 MB | **15 MB** (`bun.lock`) | 0 MB (self-contained) |
| **Binary/Artifact Size** | N/A | **78 MB** (`bun`) | **81 MB** (`dist/`) |
