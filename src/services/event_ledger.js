const { getDatabase } = require('../db/database');
const sanitize = require('../utils/sanitize');
const logger = require('../utils/logger');

class EventLedger {
  /**
   * Helper to prepare/run statements
   */
  static _getStatement(db, sql) {
    if (typeof db.query === 'function') {
      return db.query(sql);
    }
    return db.prepare(sql);
  }

  /**
   * Record an audit event into the SQLite ledger
   * @param {string} eventType 
   * @param {string} summary 
   * @param {object} [metadata] 
   * @param {string} [actor] 
   */
  static record(eventType, summary, metadata = {}, actor = 'SYSTEM') {
    try {
      const db = getDatabase();
      const sanitizedMeta = sanitize.redact(metadata);
      const metaJson = JSON.stringify(sanitizedMeta);
      const sanitizedSummary = sanitize.redact(summary);

      const stmt = this._getStatement(
        db,
        'INSERT INTO events (event_type, actor, summary, metadata_json) VALUES (?, ?, ?, ?)'
      );
      stmt.run(eventType, actor, sanitizedSummary, metaJson);
      logger.debug(`Audit event recorded: ${eventType} - ${sanitizedSummary}`);
      return true;
    } catch (err) {
      logger.warn(`Failed to record audit event: ${err.message}`);
      return false;
    }
  }

  /**
   * Get recent audit events from SQLite
   * @param {number} limit 
   * @returns {Array<object>}
   */
  static getRecentEvents(limit = 50) {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(
        db,
        'SELECT event_id, timestamp, event_type, actor, summary, metadata_json FROM events ORDER BY timestamp DESC LIMIT ?'
      );
      const rows = stmt.all(limit);
      return rows.map(r => ({
        eventId: r.event_id,
        timestamp: r.timestamp,
        eventType: r.event_type,
        actor: r.actor,
        summary: r.summary,
        metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {}
      }));
    } catch (err) {
      logger.warn(`Failed to fetch recent events: ${err.message}`);
      return [];
    }
  }
}

module.exports = EventLedger;
