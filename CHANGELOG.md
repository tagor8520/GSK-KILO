# Changelog

All notable changes to **GSK-KILO** are documented here. This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/) where practical.

---

## [Unreleased]

### Planned
- Multi-user CLI profile directory
- Pluggable upstream providers
- Internationalised dashboard (i18n)

---

## [1.0.0] — Phase 4B-3 COMPLETE / FROZEN

### Added
- Local control plane & configuration dashboard for Kilo Code + GenSpark pairing.
- Fastify 5 HTTP server with single-instance lock + auto port fallback (4380+).
- Web dashboard: target selector, sync, validate, test, stop/exit controls.
- GenSpark adapter: CLI discovery, auth status, credit/plan metadata, logout, passive $0 health probe.
- Kilo adapter: provider/model enumeration, JSONC merge, credential rotation through Kilo's auth store.
- Portable bootstrap: zero-secret profile export/import with strict `400 Security Violation` on credential patterns.
- Lifecycle manager with idle auto-shutdown (default 120s) and graceful stop.
- Notification center with deduplicated alerts.
- Comprehensive test coverage including explicit no-secret-leak assertions across every API/UI surface.

### Security
- Sanitization utility (`src/utils/sanitize.js`) redacts `gsk_*`, `apiKey`, `Bearer`, `password`, `authorization`, `token`, `secret`, and `cookie` patterns.
- Portable profile import rejects any payload matching credential patterns.
- Auth credentials live in the GenSpark CLI and Kilo's secure auth store — never in this app.

### Documentation
- Full architecture, runtime, adapters, lifecycle, dashboard E2E, portable bootstrap, and notifications docs under `docs/`.

---

## Earlier phases

See git history for the iteration log leading up to 1.0.0.