# Contributing to GSK-KILO

Thank you for your interest in improving **GSK-KILO** — a local control plane for pairing Kilo Code with the GenSpark CLI.

> ⭐ Don't forget to **star** the repo if you find it useful — it helps others find the project.

---

## Code of Conduct

By participating you agree to be respectful, constructive, and to focus on the project's stated goals (a local, zero-secret control plane for the Kilo + GenSpark pairing).

---

## Reporting Bugs

Open a GitHub Issue and include:

1. Bun version (`bun --version`).
2. OS + architecture.
3. Steps to reproduce (`gsk-kilo` output, `bun test` results, dashboard URL).
4. **Sanitized** logs — never paste real API keys, tokens, or session cookies.

---

## Suggesting Features

Open an Issue with the `enhancement` label. Please describe:

- The problem you are trying to solve.
- The proposed UX (which button, which API endpoint, which config file).
- Why the change cannot be solved with the existing portable-profile system.

---

## Development Setup

```bash
git clone https://github.com/<your-org>/gsk-kilo.git
cd gsk-kilo
bun install
bun run dev          # auto-reload server
bun test             # full test suite
```

### Project conventions

- **Language:** Vanilla JavaScript (ES modules). No TypeScript, no bundler, no framework.
- **Runtime:** Bun 1.4+ (provides the test runner, SQLite driver, and `--compile` build).
- **HTTP:** Fastify 5 only — extend `src/server/routes/`, never bypass it.
- **Secrets:** Never log or persist them. Use `src/utils/sanitize.js` before writing anything user-visible.
- **Tests:** Every public route should have a corresponding assertion in `test/` that includes a "no-secret-leak" check.

---

## Pull Requests

1. Fork → branch from `main` (`feature/<short-name>` or `fix/<short-name>`).
2. Run `bun test` locally — all suites must remain green.
3. Add or update tests for any behavioral change.
4. Update `CHANGELOG.md` under the *Unreleased* section.
5. Open a PR describing the *why*, the *what*, and any screenshots for UI changes.

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(sync): add dry-run mode to catalog sync
fix(lifecycle): release port on heartbeat timeout
docs(readme): clarify zero-secret invariant
test(bootstrap): assert Bearer patterns are rejected on import
```

---

## Security

If you find a vulnerability, **do not** open a public Issue. Email the maintainer or use GitHub's *Private vulnerability reporting*.