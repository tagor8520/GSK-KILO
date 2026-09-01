const { getDatabase } = require('../db/database');
const GenSparkAdapter = require('../adapters/genspark_adapter');
const EventLedger = require('./event_ledger');
const NotificationManager = require('./notification_manager');
const logger = require('../utils/logger');

class CatalogSync {
  static _getStatement(db, sql) {
    if (typeof db.query === 'function') {
      return db.query(sql);
    }
    return db.prepare(sql);
  }

  /**
   * Synchronize all discovered providers, endpoints, and dynamic models into SQLite
   * @returns {Promise<{ providerCount: number, endpointCount: number, modelCount: number }>}
   */
  static async syncAll() {
    logger.info('Starting full catalog synchronization into SQLite...');
    const db = getDatabase();

    // 1. Discover and sync providers
    const providers = GenSparkAdapter.discoverProviders();
    for (const p of providers) {
      const stmt = this._getStatement(
        db,
        `INSERT INTO providers (provider_id, name, npm_package, base_url, status, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(provider_id) DO UPDATE SET
           name = excluded.name,
           base_url = excluded.base_url,
           status = excluded.status,
           updated_at = CURRENT_TIMESTAMP`
      );
      stmt.run(p.providerId, p.name, p.npmPackage, p.baseUrl, p.status);
    }

    // 2. Discover and sync endpoints
    const endpoints = await GenSparkAdapter.discoverEndpoints();
    for (const ep of endpoints) {
      const stmt = this._getStatement(
        db,
        `INSERT INTO endpoints (endpoint_id, provider_id, base_url, protocol, status, last_latency_ms, last_success_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint_id) DO UPDATE SET
           base_url = excluded.base_url,
           status = excluded.status,
           last_latency_ms = excluded.last_latency_ms,
           last_success_at = excluded.last_success_at`
      );
      stmt.run(
        ep.endpointId,
        ep.providerId,
        ep.baseUrl,
        ep.protocol,
        ep.status,
        ep.lastLatencyMs,
        ep.lastSuccessAt
      );
    }

    // 3. Discover and sync dynamic models
    const models = GenSparkAdapter.discoverModels();
    for (const m of models) {
      const stmt = this._getStatement(
        db,
        `INSERT INTO models (
          model_id, provider_id, full_identifier, display_name, context_limit, input_limit, output_limit, supports_vision, supports_reasoning, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(full_identifier) DO UPDATE SET
          display_name = excluded.display_name,
          context_limit = excluded.context_limit,
          input_limit = excluded.input_limit,
          output_limit = excluded.output_limit,
          supports_vision = excluded.supports_vision,
          supports_reasoning = excluded.supports_reasoning,
          is_active = excluded.is_active`
      );
      stmt.run(
        m.modelId,
        m.providerId,
        m.fullIdentifier,
        m.displayName,
        m.contextLimit,
        m.inputLimit,
        m.outputLimit,
        m.supportsVision ? 1 : 0,
        m.supportsReasoning ? 1 : 0,
        m.isActive ? 1 : 0
      );
    }

    EventLedger.record('CATALOG_SYNCHRONIZED', `Synchronized ${providers.length} providers, ${endpoints.length} endpoints, and ${models.length} dynamic models into SQLite`, {
      providerCount: providers.length,
      endpointCount: endpoints.length,
      modelCount: models.length
    });

    logger.info(`Catalog sync complete: ${providers.length} providers, ${endpoints.length} endpoints, ${models.length} models`);
    return {
      providerCount: providers.length,
      endpointCount: endpoints.length,
      modelCount: models.length
    };
  }

  /**
   * Get all registered providers from SQLite
   * @returns {Array<object>}
   */
  static getProvidersFromDb() {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(db, 'SELECT * FROM providers ORDER BY provider_id');
      const rows = stmt.all();
      return rows.map(r => ({
        providerId: r.provider_id,
        name: r.name,
        npmPackage: r.npm_package,
        baseUrl: r.base_url,
        status: r.status,
        updatedAt: r.updated_at
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get models catalog from SQLite with optional filtering and pagination
   * @param {object} [options]
   * @returns {Array<object>}
   */
  static getModelsFromDb({ providerId = null, limit = 100, offset = 0 } = {}) {
    try {
      const db = getDatabase();
      let sql = 'SELECT * FROM models';
      const params = [];

      if (providerId) {
        sql += ' WHERE provider_id = ?';
        params.push(providerId);
      }
      sql += ' ORDER BY provider_id, model_id LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const stmt = this._getStatement(db, sql);
      const rows = stmt.all(...params);
      return rows.map(r => ({
        modelId: r.model_id,
        providerId: r.provider_id,
        fullIdentifier: r.full_identifier,
        displayName: r.display_name,
        contextLimit: r.context_limit,
        inputLimit: r.input_limit,
        outputLimit: r.output_limit,
        supportsVision: Boolean(r.supports_vision),
        supportsReasoning: Boolean(r.supports_reasoning),
        isActive: Boolean(r.is_active),
        lastTestedAt: r.last_tested_at,
        lastLatencyMs: r.last_latency_ms
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get total model count
   */
  static getModelCount() {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(db, 'SELECT COUNT(*) as count FROM models');
      const row = stmt.get();
      return row ? row.count : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get registered endpoints from SQLite
   * @returns {Array<object>}
   */
  static getEndpointsFromDb() {
    try {
      const db = getDatabase();
      const stmt = this._getStatement(db, 'SELECT * FROM endpoints ORDER BY provider_id');
      const rows = stmt.all();
      return rows.map(r => ({
        endpointId: r.endpoint_id,
        providerId: r.provider_id,
        baseUrl: r.base_url,
        protocol: r.protocol,
        status: r.status,
        lastLatencyMs: r.last_latency_ms,
        lastSuccessAt: r.last_success_at,
        lastFailureAt: r.last_failure_at,
        errorCount24h: r.error_count_24h
      }));
    } catch {
      return [];
    }
  }
}

module.exports = CatalogSync;
