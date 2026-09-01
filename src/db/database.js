const fs = require('fs');
const path = require('path');
const { DB_PATH, ensureDirectories } = require('../config/paths');
const logger = require('../utils/logger');

let activeDb = null;

/**
 * Open or return the active SQLite database instance using bun:sqlite (or fallback)
 * @param {string} customPath 
 * @returns {any}
 */
function getDatabase(customPath = DB_PATH) {
  if (activeDb) {
    return activeDb;
  }

  ensureDirectories();
  const dbDir = path.dirname(customPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true, mode: 0o700 });
  }

  let db;
  if (typeof Bun !== 'undefined') {
    const { Database } = require('bun:sqlite');
    db = new Database(customPath);
    // Compatibility: ensure prepare works consistently
    if (!db.prepare && typeof db.query === 'function') {
      db.prepare = db.query.bind(db);
    }
  } else {
    // Node.js fallback
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(customPath);
  }

  // Enforce WAL mode and foreign key constraints
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Ensure strict permissions on the DB file (0600)
  try {
    if (fs.existsSync(customPath)) {
      fs.chmodSync(customPath, 0o600);
    }
  } catch {
    // Best-effort permission enforcement
  }

  activeDb = db;
  logger.debug(`SQLite database opened at ${customPath}`);
  return db;
}

/**
 * Close active database connection cleanly
 */
function closeDatabase() {
  if (activeDb) {
    try {
      activeDb.close();
      logger.debug('SQLite database closed cleanly');
    } catch (err) {
      logger.warn(`Error closing database: ${err.message}`);
    } finally {
      activeDb = null;
    }
  }
}

module.exports = {
  getDatabase,
  closeDatabase
};
