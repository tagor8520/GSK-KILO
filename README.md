<div align="center">

```
  ┌───────────────────────────────────────────────────────────────────────────┐
  │  RX ░▒▓   CH-A · KILO   CH-B · GENSPARK   STATUS ● LIVE   PORT 4380  ▓▒░  │
  ├───────────────────────────────────────────────────────────────────────────┤
  │  PRESET   genspark-llm-proxy/claude-sonnet-4-6                            │
  │  ROUTE    direct HTTPS · 0 ms added latency · 0 secrets persisted         │
  │  CONTROL  │ target │ sync │ validate │ test │ logs │ stop │ exit │  v1.0  │
  └───────────────────────────────────────────────────────────────────────────┘
```

# **GSK-KILO**

### A local control plane that wires **Kilo Code** to **GenSpark** — without ever touching a secret.

<br/>

[![License: MIT](https://img.shields.io/badge/License-MIT-5BD9FF?style=flat-square&logo=open-source-initiative&logoColor=white)](LICENSE)
[![Runtime: Bun 1.4+](https://img.shields.io/badge/Runtime-Bun%201.4%2B-EDE7D6?style=flat-square&logo=bun&logoColor=000)](https://bun.sh)
[![Server: Fastify 5](https://img.shields.io/badge/Server-Fastify%205-FFB454?style=flat-square&logo=fastify&logoColor=000)](https://fastify.dev)
[![Zero Secrets](https://img.shields.io/badge/Invariant-ZERO%20SECRETS-5BD9FF?style=flat-square&logo=lock&logoColor=000)](#security--zero-secret-invariant)
[![Platforms](https://img.shields.io/badge/Platforms-Linux%20·%20macOS%20·%20Windows-7CE38B?style=flat-square&logo=linux&logoColor=000)](#-install)
[![Made for Kilo + GenSpark](https://img.shields.io/badge/For-Kilo%20%2B%20GenSpark-0B0F14?style=flat-square&logo=dependabot&logoColor=white)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](CONTRIBUTING.md)

</div>

---

> ⭐ **If GSK-KILO saves you an afternoon, drop a star on the repo — it makes a real difference for discoverability.**

---

## The pitch in one breath

GSK-KILO is a **local-only** dashboard for pairing **[Kilo Code](https://kilocode.ai)** (the AI coding agent) with **[GenSpark](https://www.genspark.ai)** (a Mixture-of-Agents workspace that exposes 20+ frontier LLMs). It never proxies a request. It never persists a token. It only manages configuration, validates connectivity, and hands you a clean dashboard for the rest.

```
   VS Code / Kilo CLI ──── direct HTTPS ────▶  GenSpark upstream
        ▲                                          ▲
        │                                          │
        └───────  configuration & diagnostics  ────┘
                          │
                          ▼
                  ┌──────────────────┐
                  │ GSK-KILO         │
                  │ 127.0.0.1:4380   │   control plane, not proxy
                  └──────────────────┘
```

---

## What is GenSpark?

[**GenSpark**](https://www.genspark.ai) is an **all-in-one AI workspace** built around a *Mixture-of-Agents* engine. Instead of locking you into one model, GenSpark fans a prompt out to **20+ frontier LLMs** in parallel and stitches the best parts of every answer back together. One account covers slides, docs, sheets, image, video, audio, and code.

### Models you can reach through GenSpark

| Provider | Models |
|---|---|
| **Anthropic** | Claude Opus 5 · Claude Sonnet 5 · Claude Haiku 4.5 *(free tier)* |
| **OpenAI** | GPT-5.5 / 5.5 Plus · GPT-5.4 Mini · GPT-5.2 Pro · o3-pro · GPT-5.6 Sol / Terra / Luna |
| **Google DeepMind** | Gemini 3.1 Pro Preview · Gemini 3.5 Flash · Gemini 3.6 Flash |
| **xAI** | Grok 4.5 · Grok 4.20 Reasoning |
| **DeepSeek · Mistral · Meta · 15+ more** | vision, reasoning, fast, code-specialised variants |

### Credits & plans *(verified Aug 2026)*

| Plan | Price | Credits | What you get |
|---|---|---|---|
| **Free** | $0 | **100 credits/day, refresh every 24 h** | Claude Haiku 4.5 + base models · AI Chat · Sparkpages · 1 GB AI Drive · **no credit card** |
| **Plus** | $24.99 / mo *(or $19.99/mo annual)* | **10,000 credits/month** | **All 20+ premium models** (GPT-5.5, Claude Opus 5, Gemini 3.1 Pro, Grok 4.5) · unlimited AI chat & images at **zero credit cost** · 50 GB AI Drive · Sora 2 + Veo 3.1 video · ElevenLabs audio · Super Agent priority · commercial rights |
| **Pro** | $249.99 / mo *(or $199.99/mo annual)* | **125,000 credits/month** | Everything in Plus · 1 TB AI Drive · Nano Banana Pro 4K unlimited · early-access models · priority routing · team & agency workflows |
| **Credit packs** | $20 one-time | 10,000 credits · valid 3 months | No subscription — pay-as-you-go overflow |

> 🎁 **Plus users get a one-time 10,000-credit welcome bonus** on top of the monthly allowance. **All AI chat & image generation are zero-credit through Dec 31, 2026** on paid plans.
>
> 🪙 **Why this matters for GSK-KILO:** GenSpark's generous free tier (100 credits/day with Claude Haiku 4.5) plus the Plus plan's 10,000-credit pool mean you can drive Kilo for *real* code work — refactors, reviews, long-context reasoning — without juggling five provider API keys.

---

## Before / After

```
┌─ BEFORE GSK-KILO ───────────────────────────────┐   ┌─ AFTER GSK-KILO ───────────────────────────────────┐
│  edit ~/.config/kilo/kilo.jsonc by hand         │   │  one-click SYNC from a dashboard                   │
│  copy/paste API keys across 4 config files      │ → │  zero-secret invariant enforced & test-asserted    │
│  guess which port the dashboard is on           │   │  single-instance lock, auto port fallback          │
│  pray you didn't leak a token into a backup     │   │  portable profile export/import (never secrets)    │
└─────────────────────────────────────────────────┘   └────────────────────────────────────────────────────┘
```

---

## Features

```
  ┌──────────── FEATURE BUS ────────────┐
  │  ● target selector                  │
  │  ● one-click sync (with backups)    │
  │  ● validate & live test (confirm)   │
  │  ● zero-secret invariant            │
  │  ● portable profiles                │
  │  ● status + credit balance          │
  │  ● notification center              │
  │  ● graceful lifecycle               │
  └─────────────────────────────────────┘
```

| Module | What it does |
|---|---|
| 🎯 **Target Selector** | Toggle between *Kilo Global*, *GSK-KILO Isolated*, and *Current Project* configurations — no path arithmetic. |
| ⚡ **One-Click Sync** | Non-destructively merges GenSpark models into the selected target. A timestamped backup lands in `<dir>/backups/` first. |
| ✅ **Validate** | Audits providers, base URLs, model mappings, and CLI availability for the active target. |
| 🧪 **Test (with confirm)** | Live connectivity probe. A credit-usage modal appears before any token is consumed. |
| 🔐 **Zero-Secret Invariant** | API keys, OAuth tokens, session cookies are never stored, logged, or exported — and the test suite enforces it. |
| 🧳 **Portable Profiles** | Export/import machine-independent preferences. Any payload matching `gsk_*`, `apiKey`, or `Bearer` is **rejected with `400 Security Violation`**. |
| 🛟 **GenSpark Status** | Live auth state, subscription plan (e.g. `PLUS`), and credit balance. |
| 🔔 **Notification Center** | Deduplicated, real-time alerts with resolution actions. |
| 🛑 **Graceful Lifecycle** | Single-instance lock · idle auto-shutdown (default 120 s) · port-collision fallback (`4380 → 4381+`). |
| 🪟 **Non-Intrusive** | Stop it any time. Your Kilo and GenSpark state stays untouched. |
| 📦 **Single Binary** | `bun run build` produces a standalone executable with no runtime dependency. |
| 🧪 **Hardened Test Suite** | End-to-end suites *actively* assert no secret leaks across any UI/API surface. |

---

## Install

The source is portable across **Linux, macOS, and Windows** (via WSL). The compiled binary runs natively on each.

<details>
<summary><b>🐧 Linux</b> &nbsp;·&nbsp; recommended</summary>

<br/>

```bash
# 1. Install Bun (skip if present)
curl -fsSL https://bun.sh/install | bash

# 2. Clone & install
git clone https://github.com/<your-org>/gsk-kilo.git
cd gsk-kilo
bun install

# 3. Launch
bun start
```

On launch the dashboard opens automatically at the URL printed to stdout:

```
GSK-KILO Control Plane is live: http://127.0.0.1:4380
```

If `4380` is busy, GSK-KILO binds to `4381`, `4382`, … automatically.

</details>

<details>
<summary><b>🍎 macOS</b> &nbsp;·&nbsp; Intel &amp; Apple Silicon</summary>

<br/>

```bash
# Option A — Homebrew (recommended)
brew install bun
git clone https://github.com/<your-org>/gsk-kilo.git
cd gsk-kilo
bun install
bun start

# Option B — official Bun installer (Apple Silicon / Intel)
curl -fsSL https://bun.sh/install | bash
```

For a **standalone binary** that doesn't require Bun at runtime:

```bash
bun run build
./dist/gsk-kilo-control-plane
```

> 🪟 On first run macOS may ask to allow incoming connections for `bun`. Approve it in *System Settings → Privacy & Security → Local Network*.

</details>

<details>
<summary><b>🪟 Windows</b> &nbsp;·&nbsp; via WSL 2 (recommended)</summary>

<br/>

GSK-KILO is a Bun application. Windows is supported through **WSL 2** — install WSL once, then follow the Linux instructions inside your distro:

```powershell
# PowerShell — one-time WSL 2 setup (Ubuntu)
wsl --install

# Inside the WSL terminal
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/<your-org>/gsk-kilo.git
cd gsk-kilo
bun install
bun start
```

> ⚠️ **Native Windows is not supported.** Bun's `bun:sqlite` + the Kilo/GenSpark CLIs are POSIX-oriented and behave best under WSL. Building on Windows directly will fail at `bun:sqlite` linking.

**Run it in the Windows browser:** the dashboard at `http://127.0.0.1:4380` is reachable from your Windows browser via WSL's `localhost` forwarding automatically — no extra config needed.

</details>

<details>
<summary><b>🐳 Docker (any OS)</b> &nbsp;·&nbsp; if you'd rather containerise</summary>

<br/>

```bash
docker run --rm -it \
  --name gsk-kilo \
  -p 4380:4380 \
  -v "$HOME/.config/kilo-genspark:/root/.config/kilo-genspark" \
  -v "$HOME/.config/kilo:/root/.config/kilo" \
  ghcr.io/<your-org>/gsk-kilo:latest
```

> A `Dockerfile` is not yet published in this repo — the snippet above shows the intended shape. PRs welcome.

</details>

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| [Bun](https://bun.sh) | ≥ 1.4 | Runtime + test runner + compiler in one binary |
| [Kilo CLI](https://kilocode.ai) | latest | The agent GSK-KILO configures |
| [@genspark/cli](https://www.genspark.ai) | latest | Upstream provider |
| OS | Linux · macOS · WSL on Windows | Native Windows not supported |

---

## Usage

### Web dashboard

| Control | What it does |
|---|---|
| `⚡ SYNC CONFIGURATION` | Merge GenSpark models into the selected target (with backup). |
| `Validate` | Audit providers, base URLs, CLI availability. |
| `Test` | Live connectivity probe (asks before spending credits). |
| `Open Kilo` | Verify terminal readiness for Kilo sessions. |
| `🛑 Stop Server` | Gracefully shut down. |
| `🚪 Exit GSK-KILO` | Shut down + close session. |

### Kilo CLI alongside GSK-KILO

```bash
kilo --version
kilo models                                                              # lists every GenSpark model once synced
kilo run --model genspark-llm-proxy/claude-sonnet-4-6 "Say HELLO"        # known-working default
```

---

## Configuration

| Path | Owner | Purpose |
|---|---|---|
| `~/.config/kilo/kilo.jsonc` | Kilo | Global config (shared with VS Code extension). |
| `~/.config/kilo-genspark/` | GSK-KILO | Isolated runtime, instance registry, locks. |
| `./kilo.jsonc` | You | Project-level overrides. |

Backups land in `<dir>/backups/` as timestamped copies. **No `.env` file is read or written** — every secret stays inside the GenSpark CLI and Kilo's secure auth store.

---

## Tech Stack

```
┌─ RUNTIME ───── bun ≥ 1.4 ──────────────┐
│  includes: runtime · test runner · compiler │
├─ HTTP ──────── fastify ^5.2 ───────────┤
├─ STORAGE ───── sqlite (via bun:sqlite) ┤
├─ FRONTEND ──── vanilla js · html · css ─┤
└─ TESTS ─────── bun test ───────────────┘
```

```json
{
  "dependencies": { "fastify": "^5.2.1" }
}
```

No dev dependencies. Nothing else to install.

---

## Project Structure

```
gsk-kilo/
├── README.md            ← you are here
├── LICENSE              ← ISC
├── CONTRIBUTING.md
├── CHANGELOG.md
├── SECURITY.md
├── package.json
├── bun.lock
├── .gitignore
├── docs/                ← architecture & subsystem docs
│   ├── GSK_KILO_ADAPTERS.md
│   ├── GSK_KILO_BUN_RUNTIME.md
│   ├── GSK_KILO_CONFIG_CENTER.md
│   ├── GSK_KILO_CONTROL_PLANE_ARCHITECTURE.md
│   ├── GSK_KILO_CONTROL_PLANE_CORE.md
│   ├── GSK_KILO_DASHBOARD_E2E.md
│   ├── GSK_KILO_LIFECYCLE.md
│   ├── GSK_KILO_NOTIFICATIONS.md
│   └── GSK_KILO_PORTABLE_BOOTSTRAP.md
├── src/
│   ├── index.js
│   ├── config/paths.js
│   ├── db/              ← SQLite + migrations
│   ├── server/          ← Fastify app + routes
│   ├── adapters/        ← GenSpark + Kilo adapters
│   ├── services/        ← lifecycle, instance, port, sync, …
│   └── utils/           ← runner, logger, sanitize, jsonc
├── test/                ← bun test suites
└── dist/                ← build output (gitignored)
```

---

## Testing

```bash
bun test
```

Suites assert that **no API key, OAuth token, or bearer credential** leaks into any API response, UI payload, instance file, or portable profile export.

---

## Security — *Zero-Secret Invariant*

The zero-secret invariant is a contract, not an aspiration:

1. **No secrets in API responses.** Every route is asserted to contain no `gsk_*` (non-instance), `apiKey`, or `Bearer` patterns.
2. **No secrets in UI payloads.** The web root is asserted clean.
3. **No secrets in the instance registry.** Lock + candidate files are scanned on startup and during tests.
4. **Portable profile import rejects credentials** with `400 Security Violation` if it sees `gsk_*`, `apiKey`, or `Bearer` patterns.
5. **Sanitization layer** (`src/utils/sanitize.js`) redacts known secret patterns before any string is logged or returned.

Found a vulnerability? Follow the private disclosure process in [`SECURITY.md`](SECURITY.md).

---

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Conventional Commits, `bun test` must stay green, every new route gets a no-secret-leak assertion.

---

## License

[ISC](LICENSE) — © GSK-KILO contributors.

---

<div align="center">

```
  ┌────────────────────────────────────────────────────────────────────┐
  │  PRESET   genspark-llm-proxy/claude-sonnet-4-6      v1.0.0 · FROZEN │
  │  CH-A ●   KILO   CH-B ●   GENSPARK   ROUTE ● direct HTTPS          │
  └────────────────────────────────────────────────────────────────────┘
```

*Built with bun · fastify · vanilla js.* &nbsp; ⭐ *A star goes a long way.*

</div>
