# GSK-KILO Notification & Alerting Engine Specification

## Overview

The **Notification Engine** (`NotificationManager`) manages actionable, deduplicated, priority-sorted user alerts within the GSK-KILO local control plane. It ensures users are informed of system states, required actions, and self-healing opportunities without alert fatigue or duplicate flood.

---

## 1. Notification Properties & Schema

Notifications are persisted in SQLite within the `notifications` table (`~/.config/kilo-genspark/control.db`).

### 1.1 Database Columns

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,                -- 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'SUCCESS'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  component TEXT NOT NULL,           -- 'GENSPARK' | 'KILO' | 'CATALOG' | 'SYSTEM' | 'RUNTIME'
  action_label TEXT,                 -- e.g. 'RE-AUTHENTICATE', 'REPAIR', 'SYNC'
  action_type TEXT,                  -- Action trigger ID for GUI dispatcher
  action_payload TEXT,               -- JSON serialized parameters for the action
  dedup_key TEXT UNIQUE NOT NULL,    -- Deterministic key preventing alert spam
  occurrence_count INTEGER DEFAULT 1,
  status TEXT DEFAULT 'ACTIVE',      -- 'ACTIVE' | 'DISMISSED' | 'RESOLVED'
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT
);
```

---

## 2. Priority Hierarchy & Sorting

When fetched via `GET /api/notifications` or displayed in the Dashboard UI, active notifications are strictly ordered by severity:

```text
CRITICAL (Priority 1) ─── System unbootable, missing binary, corrupt database
   │
   ▼
ERROR    (Priority 2) ─── Auth token expired, network timeout, rate limit exceeded
   │
   ▼
WARNING  (Priority 3) ─── Model deprecation warning, low credit balance warning
   │
   ▼
INFO     (Priority 4) ─── Catalog synchronization completed, background update available
   │
   ▼
SUCCESS  (Priority 5) ─── Authentication re-established, configuration repaired
```

---

## 3. Deduplication & Throttling Logic

To prevent background health checks from spamming the notification feed:

1. **Deterministic Deduplication Key (`dedup_key`)**:
   - Explicit: Provided by caller (e.g. `GENSPARK_AUTH_REQUIRED`).
   - Implicit: Hash of `${component}_${MD5(title + message)}`.
2. **Throttling on Duplicate Emission**:
   - If an active notification with matching `dedup_key` exists:
     - `occurrence_count` is incremented (`occurrence_count = occurrence_count + 1`).
     - `updated_at` is updated to `CURRENT_TIMESTAMP`.
     - `message` and `type` are updated to latest.
     - **No new row is inserted.**
3. **Re-activation on Recurrence**:
   - If a previously `DISMISSED` or `RESOLVED` issue reoccurs:
     - The status is flipped back to `ACTIVE`.
     - `occurrence_count` increments.
     - `resolved_at` is cleared.

---

## 4. Lifecycle & Resolution Engine

### 4.1 Automatic Resolution
When a subsystem detects that a previously failing condition has cleared (e.g. user ran `gsk login` and auth succeeds):
- `NotificationManager.resolveNotification('GENSPARK_AUTH_REQUIRED')` is invoked.
- The record status transitions to `RESOLVED` with `resolved_at = CURRENT_TIMESTAMP`.
- It immediately disappears from the active user feed.

### 4.2 User Dismissal
Users can dismiss notifications via the GUI or `POST /api/notifications/:id/dismiss`:
- Record status transitions to `DISMISSED`.
- The notification is hidden from the primary banner.

---

## 5. GUI Action Dispatcher

Actionable notifications expose interactive triggers directly in the Web Dashboard:

| Action Type | Action Label | Behavior |
| :--- | :--- | :--- |
| `REAUTH_GENSPARK` | `[ RE-AUTHENTICATE ]` | Opens authentication modal or triggers login flow. |
| `REPAIR_CONFIG` | `[ REPAIR ]` | Regenerates isolated `kilo.json` using `gsk init-opencode`. |
| `SYNC_CATALOG` | `[ SYNC ]` | Invokes `POST /api/genspark/sync` to refresh models in SQLite. |
| `RETRY_HEALTH` | `[ RETRY ]` | Triggers a fresh passive health check. |
