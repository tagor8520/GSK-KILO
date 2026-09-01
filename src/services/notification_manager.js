const { getDatabase } = require('../db/database');
const sanitize = require('../utils/sanitize');
const logger = require('../utils/logger');
const crypto = require('crypto');

class NotificationManager {
  static _getStatement(db, sql) {
    if (typeof db.query === 'function') {
      return db.query(sql);
    }
    return db.prepare(sql);
  }

  /**
   * Notify an event or state change with deduplication and throttling
   * @param {object} params
   * @param {string} params.type - INFO, SUCCESS, WARNING, ERROR, CRITICAL
   * @param {string} params.title
   * @param {string} params.message
   * @param {string} params.component - GENSPARK, KILO, SYSTEM, RUNTIME, NETWORK
   * @param {string} params.dedupKey - Unique key representing the issue (e.g. GENSPARK_AUTH_EXPIRED)
   * @param {string} [params.actionLabel] - e.g. "RE-AUTHENTICATE", "RETRY", "REPAIR"
   * @param {string} [params.actionType] - e.g. "AUTH_GENSPARK", "SYNC_MODELS", "NAVIGATE"
   * @param {string|object} [params.actionPayload]
   * @returns {object} notification record
   */
  static notify({
    type = 'INFO',
    title,
    message,
    component = 'SYSTEM',
    dedupKey,
    actionLabel = null,
    actionType = null,
    actionPayload = null
  }) {
    if (!dedupKey) {
      dedupKey = `${component}_${crypto.createHash('md5').update(title + message).digest('hex').slice(0, 8)}`;
    }

    const sanitizedTitle = sanitize.redact(title);
    const sanitizedMsg = sanitize.redact(message);
    const payloadStr = actionPayload
      ? typeof actionPayload === 'string'
        ? sanitize.redact(actionPayload)
        : JSON.stringify(sanitize.redact(actionPayload))
      : null;

    try {
      const db = getDatabase();

      // Check if an active notification with this dedupKey exists
      const findStmt = this._getStatement(
        db,
        'SELECT * FROM notifications WHERE dedup_key = ?'
      );
      const existing = findStmt.get(dedupKey);

      if (existing) {
        if (existing.status === 'ACTIVE') {
          // Throttle/deduplicate by incrementing occurrence_count
          const updateStmt = this._getStatement(
            db,
            `UPDATE notifications 
             SET occurrence_count = occurrence_count + 1, 
                 updated_at = CURRENT_TIMESTAMP, 
                 type = ?, 
                 title = ?, 
                 message = ?,
                 action_label = ?,
                 action_type = ?,
                 action_payload = ?
             WHERE dedup_key = ?`
          );
          updateStmt.run(type, sanitizedTitle, sanitizedMsg, actionLabel, actionType, payloadStr, dedupKey);
          logger.debug(`Throttled notification updated [${dedupKey}]: count ${existing.occurrence_count + 1}`);
          return {
            notificationId: existing.notification_id,
            dedupKey,
            occurrenceCount: existing.occurrence_count + 1,
            type,
            status: 'ACTIVE'
          };
        } else {
          // Re-activate previously dismissed or resolved notification
          const reactivateStmt = this._getStatement(
            db,
            `UPDATE notifications 
             SET status = 'ACTIVE',
                 occurrence_count = occurrence_count + 1,
                 updated_at = CURRENT_TIMESTAMP,
                 type = ?,
                 title = ?,
                 message = ?,
                 action_label = ?,
                 action_type = ?,
                 action_payload = ?
             WHERE dedup_key = ?`
          );
          reactivateStmt.run(type, sanitizedTitle, sanitizedMsg, actionLabel, actionType, payloadStr, dedupKey);
          logger.info(`Notification re-activated [${dedupKey}]: ${sanitizedTitle}`);
          return {
            notificationId: existing.notification_id,
            dedupKey,
            occurrenceCount: existing.occurrence_count + 1,
            type,
            status: 'ACTIVE'
          };
        }
      }

      // Insert new notification
      const notificationId = `notif_${crypto.randomBytes(8).toString('hex')}`;
      const insertStmt = this._getStatement(
        db,
        `INSERT INTO notifications (
          notification_id, type, title, message, component, action_label, action_type, action_payload, dedup_key, occurrence_count, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE')`
      );
      insertStmt.run(
        notificationId,
        type,
        sanitizedTitle,
        sanitizedMsg,
        component,
        actionLabel,
        actionType,
        payloadStr,
        dedupKey
      );

      if (['CRITICAL', 'ERROR', 'WARNING'].includes(type)) {
        logger.warn(`[NOTIF:${type}] ${sanitizedTitle} - ${sanitizedMsg}`);
      } else {
        logger.info(`[NOTIF:${type}] ${sanitizedTitle}`);
      }

      return {
        notificationId,
        dedupKey,
        occurrenceCount: 1,
        type,
        status: 'ACTIVE'
      };
    } catch (err) {
      logger.warn(`Failed to create notification: ${err.message}`);
      return null;
    }
  }

  /**
   * Resolve an active notification (e.g. when auth is restored)
   * @param {string} dedupKey 
   */
  static resolveNotification(dedupKey) {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(
        db,
        "UPDATE notifications SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP WHERE dedup_key = ? AND status = 'ACTIVE'"
      );
      const res = stmt.run(dedupKey);
      if (res && (res.changes > 0 || res.rowsAffected > 0)) {
        logger.info(`Notification resolved: ${dedupKey}`);
      }
      return true;
    } catch (err) {
      logger.warn(`Failed to resolve notification [${dedupKey}]: ${err.message}`);
      return false;
    }
  }

  /**
   * Dismiss a specific notification by ID
   * @param {string} notificationId 
   */
  static dismissNotification(notificationId) {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(
        db,
        "UPDATE notifications SET status = 'DISMISSED', updated_at = CURRENT_TIMESTAMP WHERE notification_id = ?"
      );
      stmt.run(notificationId);
      logger.debug(`Notification dismissed: ${notificationId}`);
      return true;
    } catch (err) {
      logger.warn(`Failed to dismiss notification: ${err.message}`);
      return false;
    }
  }

  /**
   * Get active notifications sorted by priority and recency
   * @returns {Array<object>}
   */
  static getActiveNotifications() {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(
        db,
        `SELECT * FROM notifications 
         WHERE status = 'ACTIVE' 
         ORDER BY 
           CASE type 
             WHEN 'CRITICAL' THEN 1 
             WHEN 'ERROR' THEN 2 
             WHEN 'WARNING' THEN 3 
             WHEN 'INFO' THEN 4 
             WHEN 'SUCCESS' THEN 5 
             ELSE 6 
           END,
           updated_at DESC`
      );
      const rows = stmt.all();
      return rows.map(r => ({
        notificationId: r.notification_id,
        type: r.type,
        title: r.title,
        message: r.message,
        component: r.component,
        actionLabel: r.action_label,
        actionType: r.action_type,
        actionPayload: r.action_payload ? (r.action_payload.startsWith('{') ? JSON.parse(r.action_payload) : r.action_payload) : null,
        dedupKey: r.dedup_key,
        occurrenceCount: r.occurrence_count,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
    } catch (err) {
      logger.warn(`Failed to fetch active notifications: ${err.message}`);
      return [];
    }
  }

  /**
   * Get all notifications history
   * @param {number} limit 
   * @returns {Array<object>}
   */
  static getHistory(limit = 50) {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(
        db,
        'SELECT * FROM notifications ORDER BY updated_at DESC LIMIT ?'
      );
      const rows = stmt.all(limit);
      return rows.map(r => ({
        notificationId: r.notification_id,
        type: r.type,
        title: r.title,
        message: r.message,
        component: r.component,
        actionLabel: r.action_label,
        actionType: r.action_type,
        dedupKey: r.dedup_key,
        occurrenceCount: r.occurrence_count,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }));
    } catch (err) {
      logger.warn(`Failed to fetch notifications history: ${err.message}`);
      return [];
    }
  }
}

module.exports = NotificationManager;
