const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const MIGRATIONS = [
  {
    name: '001_initial_schema',
    up(db) {
      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      db.exec(schemaSql);
    }
  },
  {
    name: '002_add_notifications_table',
    up(db) {
      db.exec(`
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
        CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
        CREATE INDEX IF NOT EXISTS idx_notifications_updated ON notifications(updated_at DESC);
      `);
    }
  }
];

/**
 * Helper to prepare or query statements across bun:sqlite and node:sqlite
 */
function getStatement(db, sql) {
  if (typeof db.query === 'function') {
    return db.query(sql);
  }
  return db.prepare(sql);
}

/**
 * Execute all pending database migrations
 * @param {any} db 
 */
function runMigrations(db) {
  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = getStatement(db, 'SELECT name FROM _migrations').all();
  const appliedSet = new Set(appliedRows.map(r => r.name));

  let appliedCount = 0;

  for (const migration of MIGRATIONS) {
    if (!appliedSet.has(migration.name)) {
      logger.info(`Applying database migration: ${migration.name}`);
      migration.up(db);
      getStatement(db, 'INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
      appliedCount++;
    }
  }

  if (appliedCount > 0) {
    logger.info(`Successfully applied ${appliedCount} migration(s)`);
  } else {
    logger.debug('Database schema is up to date (0 pending migrations)');
  }

  return {
    appliedCount,
    totalMigrations: MIGRATIONS.length
  };
}

module.exports = {
  runMigrations,
  MIGRATIONS
};
