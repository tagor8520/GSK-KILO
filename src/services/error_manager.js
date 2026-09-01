const { getDatabase } = require('../db/database');
const sanitize = require('../utils/sanitize');
const logger = require('../utils/logger');
const crypto = require('crypto');

class ErrorManager {
  static _getStatement(db, sql) {
    if (typeof db.query === 'function') {
      return db.query(sql);
    }
    return db.prepare(sql);
  }

  /**
   * Record a normalized error into SQLite
   * @param {object} params
   * @param {string} params.component
   * @param {string} params.operation
   * @param {string} params.errorCode
   * @param {string} [params.severity] - INFO, WARNING, ERROR, CRITICAL
   * @param {string} params.safeMessage
   * @param {string|object} [params.technicalDetails]
   * @param {string} [params.resolution]
   * @returns {string} errorId
   */
  static recordError({
    component,
    operation,
    errorCode,
    severity = 'ERROR',
    safeMessage,
    technicalDetails = null,
    resolution = 'Check logs or restart service'
  }) {
    const errorId = `err_${crypto.randomBytes(8).toString('hex')}`;
    try {
      const db = getDatabase();
      const sanitizedMsg = sanitize.redact(safeMessage);
      const sanitizedDetails = technicalDetails
        ? typeof technicalDetails === 'string'
          ? sanitize.redact(technicalDetails)
          : JSON.stringify(sanitize.redact(technicalDetails))
        : null;

      const stmt = this._getStatement(
        db,
        `INSERT INTO errors (
          error_id, component, operation, error_code, severity, safe_message, technical_details, resolution, resolved
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`
      );
      stmt.run(
        errorId,
        component,
        operation,
        errorCode,
        severity,
        sanitizedMsg,
        sanitizedDetails,
        resolution
      );
      logger.error(`[${component}:${operation}] ${errorCode} - ${sanitizedMsg}`);
      return errorId;
    } catch (err) {
      logger.warn(`Failed to record normalized error: ${err.message}`);
      return errorId;
    }
  }

  /**
   * Retrieve recent errors from SQLite
   * @param {number} limit 
   * @returns {Array<object>}
   */
  static getRecentErrors(limit = 50) {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(
        db,
        'SELECT * FROM errors ORDER BY timestamp DESC LIMIT ?'
      );
      const rows = stmt.all(limit);
      return rows.map(r => ({
        errorId: r.error_id,
        timestamp: r.timestamp,
        component: r.component,
        operation: r.operation,
        errorCode: r.error_code,
        severity: r.severity,
        safeMessage: r.safe_message,
        technicalDetails: r.technical_details,
        resolution: r.resolution,
        resolved: Boolean(r.resolved)
      }));
    } catch (err) {
      logger.warn(`Failed to fetch recent errors: ${err.message}`);
      return [];
    }
  }

  /**
   * Mark error as resolved
   * @param {string} errorId 
   */
  static resolveError(errorId) {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(db, 'UPDATE errors SET resolved = 1 WHERE error_id = ?');
      stmt.run(errorId);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = ErrorManager;
