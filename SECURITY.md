# Security Policy

GSK-KILO is built around a **zero-secret invariant**: it never persists, logs, or transmits API keys, OAuth tokens, or session cookies. Credentials always remain in the **GenSpark CLI** and **Kilo's secure auth store**.

---

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.0.x   | ✅ Active          |
| < 1.0   | ❌ No longer maintained |

---

## Reporting a Vulnerability

**Please do not open a public GitHub Issue for security problems.**

Instead, use GitHub's *Private vulnerability reporting*:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.
3. Provide:
   - A clear description of the issue and impact.
   - Reproduction steps (sanitize any sensitive output first).
   - Bun version and OS.

You can expect an acknowledgement within **72 hours** and a triage decision within **7 days**.

---

## What *not* to report here

- Bugs unrelated to confidentiality, integrity, or availability — use a regular Issue.
- Issues in upstream tools (Kilo CLI, GenSpark CLI, Fastify, Bun) — report them upstream.

---

## Hallmark Security Properties

These properties are asserted by the test suite and are part of the project's contract:

1. **Zero secrets in API responses.** Every route's response body is asserted to contain no `gsk_*` (non-instance), `apiKey`, or `Bearer` signatures.
2. **Zero secrets in UI payloads.** The web root is asserted to contain no credential patterns.
3. **Zero secrets in instance registry.** Lock + candidate files are scanned for credential patterns on startup and during tests.
4. **Portable profile import rejects credentials.** Any profile JSON matching `gsk_*`, `apiKey`, or `Bearer` is rejected with `400 Security Violation`.
5. **Sanitization layer.** `src/utils/sanitize.js` redacts known secret patterns before any string is logged or returned to a caller.

Thanks for helping keep GSK-KILO and its users safe.