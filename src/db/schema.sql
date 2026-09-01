-- GSK-KILO Control Plane Initial SQLite DDL Schema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 1. Machine & Environment State
CREATE TABLE IF NOT EXISTS machines (
    machine_id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    os_name TEXT NOT NULL,
    os_version TEXT NOT NULL,
    architecture TEXT NOT NULL,
    node_version TEXT NOT NULL,
    npm_version TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Installed Packages & CLI Tools
CREATE TABLE IF NOT EXISTS installations (
    package_name TEXT PRIMARY KEY,
    installed_version TEXT NOT NULL,
    binary_path TEXT NOT NULL,
    is_global INTEGER DEFAULT 1,
    last_verified DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Providers Registry
CREATE TABLE IF NOT EXISTS providers (
    provider_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    npm_package TEXT NOT NULL,
    base_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Upstream Endpoints
CREATE TABLE IF NOT EXISTS endpoints (
    endpoint_id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    base_url TEXT NOT NULL,
    protocol TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'HEALTHY',
    last_latency_ms INTEGER DEFAULT 0,
    last_success_at DATETIME,
    last_failure_at DATETIME,
    error_count_24h INTEGER DEFAULT 0,
    FOREIGN KEY(provider_id) REFERENCES providers(provider_id) ON DELETE CASCADE
);

-- 5. Dynamic Models Catalog
CREATE TABLE IF NOT EXISTS models (
    model_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    full_identifier TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    context_limit INTEGER NOT NULL,
    input_limit INTEGER NOT NULL,
    output_limit INTEGER NOT NULL,
    supports_vision INTEGER DEFAULT 0,
    supports_reasoning INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    last_tested_at DATETIME,
    last_latency_ms INTEGER DEFAULT 0,
    FOREIGN KEY(provider_id) REFERENCES providers(provider_id) ON DELETE CASCADE
);

-- 6. Health Checks History
CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    response_code INTEGER,
    error_message TEXT,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 7. Error Records
CREATE TABLE IF NOT EXISTS errors (
    error_id TEXT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    component TEXT NOT NULL,
    operation TEXT NOT NULL,
    error_code TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'ERROR',
    safe_message TEXT NOT NULL,
    technical_details TEXT,
    resolution TEXT NOT NULL,
    resolved INTEGER DEFAULT 0
);

-- 8. Structured Audit Events
CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'SYSTEM',
    summary TEXT NOT NULL,
    metadata_json TEXT
);

-- 9. Control Plane Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT PRIMARY KEY,
    type TEXT NOT NULL, -- INFO, SUCCESS, WARNING, ERROR, CRITICAL
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    component TEXT NOT NULL,
    action_label TEXT,
    action_type TEXT,
    action_payload TEXT,
    dedup_key TEXT UNIQUE NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, DISMISSED, RESOLVED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_health_checks_checked_at ON health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_timestamp ON errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_updated ON notifications(updated_at DESC);
