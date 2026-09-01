# GSK-KILO Phase 4B-2.2 — Kilo Configuration Center & Side-Quest Closeout

## 1. Overview
Phase 4B-2.2 implements the **KILO CONFIGURATION** center directly inside the GSK-KILO local control plane dashboard and REST API surface, completing the GUI-first bridge between GenSpark and Kilo Code.

In accordance with the Side-Quest Closeout directive, implementation remains simple, fast, and lightweight with zero added complexity, services, or proxy infrastructure.

---

## 2. Kilo Configuration Dashboard Component
The dashboard (`src/server/routes/root.js`) provides a dedicated, accessible card with live status and actions:

```text
┌──────────────────────────────────────────────────────────┐
│ KILO CONFIGURATION                                       │
├──────────────────────────────────────────────────────────┤
│ Installation        ● Detected 7.2.0                     │
│ Authentication      ● Authenticated                      │
│ Configuration       ● Valid                              │
│                                                          │
│ GENSPARK PROVIDER                                        │
│ Provider ID         genspark-llm-proxy                   │
│ Endpoint            https://www.genspark.ai/api/llm_proxy│
│ Models              36 available                         │
│ Active Model        claude-sonnet-4-6                    │
│                                                          │
│ [ 🔄 Sync ]  [ 🔍 Validate ]  [ 🧪 Test ]  [ 🚀 Open Kilo ] │
└──────────────────────────────────────────────────────────┘
```

### Action Controls
1. **`[ 🔄 Sync ]`**: Safely compares isolated `kilo.json` with GenSpark catalog, backs up before writing, and auto-rolls back on validation failure.
2. **`[ 🔍 Validate ]`**: Evaluates 5-point verification (Kilo binary, readable config, provider entry, HTTPS upstream endpoint, model definitions).
3. **`[ 🧪 Test ]`**: Triggers explicit user confirmation modal warning:
   > *"This performs a real GenSpark model request. Model: genspark-llm-proxy/claude-sonnet-4-6. Usage/credits may apply. [ Cancel ] [ Test ]"*
   Canceling performs zero inference. Confirming sends `POST /api/kilo/test` and displays latency and pass/fail status.
4. **`[ 🚀 Open Kilo ]`**: Initiates a Kilo session using isolated environment configuration.

---

## 3. REST API Endpoints

| Method | Path | Description | Zero-Secret Protected |
|---|---|---|---|
| `GET` | `/api/kilo/status` | Comprehensive status (installation, version, auth, config, provider, endpoint, models) | ✅ |
| `POST` | `/api/kilo/validate` | 5-point configuration verification with detailed check booleans | ✅ |
| `POST` | `/api/kilo/sync` | Safe configuration synchronization with backup and rollback | ✅ |
| `POST` | `/api/kilo/test` | Explicit user-triggered live inference test on upstream GenSpark | ✅ |
| `POST` | `/api/kilo/launch` | Launches/readies isolated Kilo session via safe argv | ✅ |
| `GET` | `/api/kilo/models` | Lists discovered models for isolated Kilo runtime | ✅ |

---

## 4. Invariant Verification

- **Direct Upstream**: All requests go directly to `https://www.genspark.ai/api/llm_proxy/v1`. Zero localhost LLM proxying.
- **Zero Secrets**: API tokens are never present in HTML, API responses, SQLite database, notifications, or logs.
- **Passive vs Active Separation**: Passive status checks (`GET /api/status`, `/api/health`, `/api/kilo/status`) consume **0 tokens/credits**. Real inference is only executed upon explicit user confirmation.
- **Single Instance & Lifecycle**: Auto-shutdown timer is guarded during active synchronization and test operations.

---

## 5. Test Verification Matrix

| Suite | Tests | Result |
|---|---|---|
| `bun test test/control_plane.test.js` | 36 unit & API tests (including TEST 22-28) | **PASS (100%)** |
| `bun test/lifecycle_e2e.test.js` | 8 OS lifecycle & PID reuse steps | **PASS (100%)** |
| `bun test/browser_e2e.test.js` | 12 browser rendering & UI flow steps | **PASS (100%)** |
| Live Inference (`KiloAdapter.testInference`) | Live GenSpark Claude Sonnet 4.6 request | **PASS (8.4s)** |
| Phase 3 Launcher Regression (`gsk-kilo`) | Live CLI test with 36 models | **PASS** |
