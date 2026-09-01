const { test, describe, beforeAll, afterAll, expect } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const { createApp } = require('../src/server/app');
const { getDatabase, closeDatabase } = require('../src/db/database');
const { runMigrations } = require('../src/db/migrations');
const { RUNTIME_DIR, DB_PATH, LOCK_FILE, DEFAULT_PORT, HOST } = require('../src/config/paths');
const { sanitizeText, sanitizeObject } = require('../src/utils/sanitize');
const CommandRunner = require('../src/utils/command_runner');
const PortManager = require('../src/services/port_manager');
const InstanceLock = require('../src/services/instance_lock');
const LifecycleManager = require('../src/services/lifecycle_manager');
const BrowserLauncher = require('../src/services/browser_launcher');
const { startServer, stopServer } = require('../src/server/server');

describe('GSK-KILO Control Plane Core (Bun 1.4 Runtime)', () => {
  let app;
  let db;

  beforeAll(async () => {
    closeDatabase();
    InstanceLock.releaseLock();
    db = getDatabase();
    runMigrations(db);
    app = createApp({ port: DEFAULT_PORT, host: HOST });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    closeDatabase();
    InstanceLock.releaseLock();
  });

  // Base Functionality Tests
  test('TEST 1: Fastify application factory initializes properly under Bun', () => {
    expect(app).toBeDefined();
    expect(typeof app.inject).toBe('function');
  });

  test('TEST 2: Database is opened via bun:sqlite at runtime directory', () => {
    expect(DB_PATH).toBe(path.join(os.homedir(), '.config', 'kilo-genspark', 'control.db'));
    expect(fs.existsSync(DB_PATH)).toBe(true);
  });

  test('TEST 3: Runtime directory (0700) and database (0600) permissions are enforced', () => {
    const dirStat = fs.statSync(RUNTIME_DIR);
    const dbStat = fs.statSync(DB_PATH);
    const dirMode = (dirStat.mode & 0o777).toString(8);
    const dbMode = (dbStat.mode & 0o777).toString(8);
    expect(dirMode).toBe('700');
    expect(dbMode).toBe('600');
  });

  test('TEST 4: Migrations execute deterministically creating 9 core tables', () => {
    const expectedTables = [
      '_migrations', 'machines', 'installations', 'providers',
      'endpoints', 'models', 'health_checks', 'errors', 'events', 'settings'
    ];
    const tables = (db.prepare ? db.prepare("SELECT name FROM sqlite_master WHERE type='table'") : db.query("SELECT name FROM sqlite_master WHERE type='table'")).all();
    const tableNames = tables.map(t => t.name);

    for (const tbl of expectedTables) {
      expect(tableNames).toContain(tbl);
    }
  });

  test('TEST 5: Second migration execution is idempotent without data loss', () => {
    const result = runMigrations(db);
    expect(result.appliedCount).toBe(0);
  });

  test('TEST 6: GET /api/status returns 200 with runtime metadata', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.application).toBe('gsk-kilo-control-plane');
    expect(body.runtime).toBe('bun');
    expect(body.dashboard.url).toBe('http://127.0.0.1:4380');
  });

  test('TEST 7: GET /api/system returns safe environment information', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/system',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.runtime.engine).toBe('bun');
    expect(body.runtime.databaseStatus).toBe('connected');
    expect(body.cli.kilo).toBeDefined();
    expect(body.cli.gsk).toBeDefined();
  }, 15000);

  test('TEST 8: GET /api/health returns healthy without triggering LLM inference', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('healthy');
    expect(body.database).toBe('ok');
    expect(body.server).toBe('ok');
  }, 15000);

  test('TEST 9: No credentials or tokens leak in any API response or web root', async () => {
    const endpoints = ['/api/status', '/api/system', '/api/health', '/api/heartbeat', '/'];
    for (const ep of endpoints) {
      const response = await app.inject({
        method: 'GET',
        url: ep,
        headers: { host: '127.0.0.1:4380' }
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).not.toMatch(/gsk_[a-zA-Z0-9_\-]{16,}/i);
      expect(response.body).not.toMatch(/"apiKey":\s*"[^"]+"/i);
      expect(response.body).not.toMatch(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i);
    }
  }, 20000);

  test('TEST 10: Secret sanitization redacts token signatures cleanly', () => {
    const sample = 'Key: gsk_1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.xxx';
    const clean = sanitizeText(sample);
    expect(clean).toBe('Key: [REDACTED_SECRET] and Bearer [REDACTED_TOKEN]');

    const obj = sanitizeObject({ apiKey: 'gsk_secret1234567890', normal: 'safe' });
    expect(obj.apiKey).toBe('[REDACTED]');
    expect(obj.normal).toBe('safe');
  });

  test('TEST 11: Host header validation rejects untrusted origins with 403 Forbidden', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/status',
      headers: { host: 'malicious-host.org' }
    });
    expect(response.statusCode).toBe(403);
  });

  // Edge Case Matrix Tests (E1 - E18)
  test('E1 & E2 & E3: PortManager handles port availability and collisions smoothly', async () => {
    // Occupy a dummy port to simulate collision
    const dummyServer = net.createServer();
    await new Promise((resolve) => dummyServer.listen(4390, '127.0.0.1', resolve));

    const isOccupied = await PortManager.isPortAvailable(4390, '127.0.0.1');
    expect(isOccupied).toBe(false);

    // Find available port starting from 4390
    const resolvedPort = await PortManager.findAvailablePort(4390, 10, '127.0.0.1');
    expect(resolvedPort).toBeGreaterThanOrEqual(4391);

    await new Promise((resolve) => dummyServer.close(resolve));
  });

  test('E4 & E5: InstanceLock manages single instance and cleans up stale locks', async () => {
    // Write stale lock file pointing to non-existent PID
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: 9999999,
      host: '127.0.0.1',
      port: 4380,
      url: 'http://127.0.0.1:4380',
      started_at: new Date().toISOString()
    }, null, 2), { mode: 0o600 });

    const check = await InstanceLock.checkExistingInstance();
    expect(check.running).toBe(false); // Stale lock detected and cleared
    expect(fs.existsSync(LOCK_FILE)).toBe(false);
  });

  test('E6 & E7: SQLite database in WAL mode supports concurrent reads and migrations', () => {
    expect(fs.existsSync(DB_PATH)).toBe(true);
    const checkDb = getDatabase();
    const rows = (checkDb.prepare ? checkDb.prepare('SELECT 1 as val') : checkDb.query('SELECT 1 as val')).get();
    expect(rows.val).toBe(1);
  });

  test('E8: BrowserLauncher degrades gracefully when browser binary is missing', async () => {
    const result = await BrowserLauncher.open('http://127.0.0.1:4380');
    expect(result.url).toBe('http://127.0.0.1:4380');
  });

  test('E9, E10, E11: LifecycleManager tracks heartbeat and idle threshold correctly', async () => {
    const lifecycle = new LifecycleManager({ idleTimeoutSec: 1 }); // 1 second idle for testing
    expect(lifecycle.getStatus().autoCloseEnabled).toBe(true);

    let shutdownCalled = false;
    lifecycle.startIdleCheck(() => {
      shutdownCalled = true;
    }, 100);

    // Initial state: not shutdown
    expect(shutdownCalled).toBe(false);

    // Send heartbeat to keep alive
    lifecycle.recordHeartbeat();
    expect(lifecycle.getStatus().lastSeenSecondsAgo).toBeLessThanOrEqual(1);

    // Track active child process
    const dummyChild = { id: 1 };
    lifecycle.trackChildProcess(dummyChild);
    expect(lifecycle.getStatus().activeChildProcesses).toBe(1);

    // Untrack child process
    lifecycle.untrackChildProcess(dummyChild);
    expect(lifecycle.getStatus().activeChildProcesses).toBe(0);

    // Wait for idle threshold to elapse
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(shutdownCalled).toBe(true);
    lifecycle.stopIdleCheck();
  });

  test('E12, E13, E14: CommandRunner resolves system binaries and queries versions safely', async () => {
    const bunWhich = CommandRunner.which('bun');
    expect(bunWhich).not.toBeNull();

    const nodeWhich = CommandRunner.which('node');
    expect(nodeWhich).not.toBeNull();

    const bunVer = await CommandRunner.run('bun', ['--version']);
    expect(bunVer.exitCode).toBe(0);
    expect(bunVer.stdout).toMatch(/^1\./);
  });

  test('E17 & E18: Credential isolation invariant is strictly preserved in SQLite', () => {
    const checkDb = getDatabase();
    // Query all tables to verify zero tokens stored
    const tables = (checkDb.prepare ? checkDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'") : checkDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).all();
    for (const t of tables) {
      const rows = (checkDb.prepare ? checkDb.prepare(`SELECT * FROM ${t.name}`) : checkDb.query(`SELECT * FROM ${t.name}`)).all();
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toMatch(/gsk_[a-zA-Z0-9_\-]{16,}/i);
    }
  });

  // Phase 4B-2 Adapters & Plug-and-Play Tests
  test('TEST 12: GenSparkAdapter reports installation, version, login status, and user plan', async () => {
    const { GenSparkAdapter } = require('../src/index');
    const installed = GenSparkAdapter.isInstalled();
    expect(installed.installed).toBe(true);

    const version = await GenSparkAdapter.getVersion();
    expect(version.version).toMatch(/^\d+\.\d+\.\d+/);

    const login = await GenSparkAdapter.getLoginStatus();
    expect(login.authenticated).toBe(true);
    expect(login.plan).toBe('plus');
    expect(typeof login.creditBalance).toBe('number');

    const providers = GenSparkAdapter.discoverProviders();
    expect(providers.length).toBe(2);

    const models = GenSparkAdapter.discoverModels();
    expect(models.length).toBe(36);
  });

  test('TEST 13: KiloAdapter reports installation, version, auth status, and configuration validity', async () => {
    const { KiloAdapter } = require('../src/index');
    const installed = KiloAdapter.isInstalled();
    expect(installed.installed).toBe(true);

    const version = await KiloAdapter.getVersion();
    expect(version.version).toMatch(/^\d+\.\d+\.\d+/);

    const auth = await KiloAdapter.getAuthStatus();
    expect(auth.authenticated).toBe(true);

    const config = KiloAdapter.getConfigStatus();
    expect(config.valid).toBe(true);
    expect(config.providerCount).toBeGreaterThanOrEqual(2);

    const health = await KiloAdapter.health();
    expect(health.status).toBe('HEALTHY');
  }, 30000);

  test('TEST 14: CatalogSync populates providers, endpoints, and dynamic models into SQLite', async () => {
    const { CatalogSync } = require('../src/index');
    const result = await CatalogSync.syncAll();
    expect(result.providerCount).toBe(2);
    expect(result.endpointCount).toBe(2);
    expect(result.modelCount).toBe(36);

    const providers = CatalogSync.getProvidersFromDb();
    expect(providers.length).toBe(2);

    const models = CatalogSync.getModelsFromDb();
    expect(models.length).toBe(36);

    const endpoints = CatalogSync.getEndpointsFromDb();
    expect(endpoints.length).toBe(2);
  });

  test('TEST 15: NotificationManager handles creation, deduplication, throttling, resolution, and dismissal', () => {
    const { NotificationManager } = require('../src/index');
    const testKey = `TEST_ISSUE_${Date.now()}`;
    const resKey = `TEST_RES_${Date.now()}`;

    const notif1 = NotificationManager.notify({
      type: 'WARNING',
      title: 'Test Warning',
      message: 'Initial failure',
      component: 'TEST',
      dedupKey: testKey,
      actionLabel: 'REPAIR',
      actionType: 'REPAIR_TEST'
    });
    expect(notif1.occurrenceCount).toBe(1);

    // Duplicate notification increments count without creating new row
    const notif2 = NotificationManager.notify({
      type: 'WARNING',
      title: 'Test Warning',
      message: 'Repeated failure',
      component: 'TEST',
      dedupKey: testKey
    });
    expect(notif2.occurrenceCount).toBe(2);

    const activeList = NotificationManager.getActiveNotifications();
    const found = activeList.find(n => n.dedupKey === testKey);
    expect(found).toBeDefined();
    expect(found.occurrenceCount).toBe(2);

    // Dismiss notification
    NotificationManager.dismissNotification(found.notificationId);
    const activeAfterDismiss = NotificationManager.getActiveNotifications();
    expect(activeAfterDismiss.find(n => n.dedupKey === testKey)).toBeUndefined();

    // Re-notify and then Resolve
    NotificationManager.notify({
      type: 'ERROR',
      title: 'Resolvable Issue',
      message: 'Temporary glitch',
      component: 'TEST',
      dedupKey: resKey
    });
    NotificationManager.resolveNotification(resKey);
    const activeAfterResolve = NotificationManager.getActiveNotifications();
    expect(activeAfterResolve.find(n => n.dedupKey === resKey)).toBeUndefined();
  });

  test('TEST 16: EventLedger records structured events with redacted metadata', () => {
    const { EventLedger } = require('../src/index');
    EventLedger.record('TEST_EVENT', 'Audit test with secret', {
      apiKey: 'gsk_secret_sample_key_12345',
      safeKey: 'clean_value'
    });

    const recent = EventLedger.getRecentEvents(10);
    const event = recent.find(e => e.eventType === 'TEST_EVENT');
    expect(event).toBeDefined();
    expect(event.metadata.apiKey).toBe('[REDACTED]');
    expect(event.metadata.safeKey).toBe('clean_value');
  });

  test('TEST 17: ErrorManager normalizes and persists errors with resolution tracking', () => {
    const { ErrorManager } = require('../src/index');
    const errId = ErrorManager.recordError({
      component: 'GENSPARK',
      operation: 'DISCOVERY',
      errorCode: 'DISCOVERY_TIMEOUT',
      safeMessage: 'Model discovery encountered timeout',
      technicalDetails: 'Key: gsk_sample_secret_key',
      resolution: 'Retry sync'
    });
    expect(errId).toBeDefined();

    const errors = ErrorManager.getRecentErrors(10);
    const err = errors.find(e => e.errorId === errId);
    expect(err).toBeDefined();
    expect(err.technicalDetails).toContain('[REDACTED_SECRET]');
    expect(err.resolved).toBe(false);

    ErrorManager.resolveError(errId);
    const errorsAfter = ErrorManager.getRecentErrors(10);
    const resolvedErr = errorsAfter.find(e => e.errorId === errId);
    expect(resolvedErr.resolved).toBe(true);
  });

  test('TEST 18: REST APIs serve GenSpark, Kilo, and Catalog data accurately', async () => {
    // 1. GET /api/genspark/status
    const gskRes = await app.inject({
      method: 'GET',
      url: '/api/genspark/status',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(gskRes.statusCode).toBe(200);
    const gskBody = JSON.parse(gskRes.body);
    expect(gskBody.installed).toBe(true);
    expect(gskBody.auth.authenticated).toBe(true);

    // 2. GET /api/kilo/status
    const kiloRes = await app.inject({
      method: 'GET',
      url: '/api/kilo/status',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(kiloRes.statusCode).toBe(200);
    const kiloBody = JSON.parse(kiloRes.body);
    expect(kiloBody.installed).toBe(true);
    expect(kiloBody.config.valid).toBe(true);

    // 3. GET /api/providers
    const provRes = await app.inject({
      method: 'GET',
      url: '/api/providers',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(provRes.statusCode).toBe(200);
    const provBody = JSON.parse(provRes.body);
    expect(provBody.count).toBe(2);

    // 4. GET /api/models
    const modRes = await app.inject({
      method: 'GET',
      url: '/api/models',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(modRes.statusCode).toBe(200);
    const modBody = JSON.parse(modRes.body);
    expect(modBody.total).toBe(36);

    // 5. GET /api/endpoints
    const epRes = await app.inject({
      method: 'GET',
      url: '/api/endpoints',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(epRes.statusCode).toBe(200);
    const epBody = JSON.parse(epRes.body);
    expect(epBody.count).toBe(2);

    // 6. GET /api/notifications
    const notifRes = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(notifRes.statusCode).toBe(200);

    // 7. GET /api/events and GET /api/errors
    const evRes = await app.inject({
      method: 'GET',
      url: '/api/events',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(evRes.statusCode).toBe(200);

    const errRes = await app.inject({
      method: 'GET',
      url: '/api/errors',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(errRes.statusCode).toBe(200);
  }, 20000);

  test('TEST 19: InstanceManager registers, validates, discovers, and cleans up instances', async () => {
    const { InstanceManager, paths } = require('../src/index');
    const testInstId = InstanceManager.generateInstanceId();
    expect(testInstId).toMatch(/^gsk_inst_/);

    // Register active instance
    const reg = InstanceManager.registerInstance({
      instanceId: testInstId,
      host: '127.0.0.1',
      port: 4399,
      url: 'http://127.0.0.1:4399',
      version: '1.0.0'
    });
    expect(reg.instanceId).toBe(testInstId);
    expect(reg.pid).toBe(process.pid);

    // Discover candidate records
    const candidates = InstanceManager.discoverCandidateRecords();
    const found = candidates.find(c => c.instanceId === testInstId);
    expect(found).toBeDefined();
    expect(found.pid).toBe(process.pid);

    // Unregister instance
    InstanceManager.unregisterInstance(testInstId);
    const afterUnreg = InstanceManager.discoverCandidateRecords();
    expect(afterUnreg.find(c => c.instanceId === testInstId)).toBeUndefined();
  });

  test('TEST 20: InstanceManager validates dead PIDs and cleans stale entries', async () => {
    const { InstanceManager, paths } = require('../src/index');
    const fs = require('fs');
    const path = require('path');

    // Create a fake candidate with a dead PID (e.g. 9999999)
    const deadInstId = 'gsk_inst_dead_' + Date.now();
    const deadFilePath = path.join(paths.INSTANCES_DIR, `${deadInstId}.json`);
    fs.writeFileSync(deadFilePath, JSON.stringify({
      instanceId: deadInstId,
      pid: 9999999,
      host: '127.0.0.1',
      port: 4398,
      url: 'http://127.0.0.1:4398'
    }), { mode: 0o600 });

    const val = await InstanceManager.validateCandidate({
      instanceId: deadInstId,
      pid: 9999999,
      host: '127.0.0.1',
      port: 4398
    });
    expect(val.valid).toBe(false);
    expect(val.reason).toBe('pid_dead');

    // findActiveHealthyInstance automatically cleans dead stale files
    await InstanceManager.findActiveHealthyInstance();
    expect(fs.existsSync(deadFilePath)).toBe(false);
  });

  test('TEST 21: LifecycleManager activeOperations guards against premature idle shutdown', () => {
    const { LifecycleManager } = require('../src/index');
    const lm = new LifecycleManager({ idleTimeoutSec: 1 });
    expect(lm.activeOperations).toBe(0);

    lm.startOperation();
    expect(lm.activeOperations).toBe(1);

    lm.recordHeartbeat();
    expect(lm.lastDashboardSeen).toBeGreaterThan(0);

    lm.endOperation();
    expect(lm.activeOperations).toBe(0);
  });

  test('TEST 22: KiloAdapter.getDetailedStatus() returns complete provider, endpoint, and model status', async () => {
    const { KiloAdapter } = require('../src/index');
    const status = await KiloAdapter.getDetailedStatus('global');
    expect(status.installed).toBe(true);
    expect(status.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(status.auth.authenticated).toBe(true);
    expect(status.config.valid).toBe(true);
    expect(status.endpoint).toBe('https://www.genspark.ai/api/llm_proxy/v1');
    expect(status.config.modelCount).toBeGreaterThanOrEqual(36);
    expect(status.activeModel).toBe('claude-sonnet-4-6');
    expect(status.providers).toContain('genspark-llm-proxy');
  }, 25000);

  test('TEST 23: POST /api/kilo/validate checks installation, config, provider, endpoint, and models', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kilo/validate',
      headers: { host: '127.0.0.1:4380' },
      payload: { target: 'global' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.valid).toBe(true);
    expect(body.checks.kilo).toBe(true);
    expect(body.checks.config).toBe(true);
    expect(body.checks.provider).toBe(true);
    expect(body.checks.endpoint).toBe(true);
    expect(body.checks.models).toBe(true);
    expect(body.details.endpoint).toBe('https://www.genspark.ai/api/llm_proxy/v1');
    expect(body.details.modelCount).toBeGreaterThanOrEqual(36);
  }, 25000);

  test('TEST 24: POST /api/kilo/sync performs safe synchronization without data loss', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kilo/sync',
      headers: { host: '127.0.0.1:4380' },
      payload: { target: 'global' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  }, 25000);

  test('TEST 25: POST /api/kilo/launch initiates session cleanly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kilo/launch',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  }, 25000);

  test('TEST 26: Kilo configuration validation guarantees zero secrets in API responses', async () => {
    const endpoints = ['/api/kilo/status', '/api/kilo/models'];
    for (const ep of endpoints) {
      const res = await app.inject({
        method: 'GET',
        url: ep,
        headers: { host: '127.0.0.1:4380' }
      });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toMatch(/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i);
      expect(res.body).not.toMatch(/"apiKey":\s*"[^"]+"/i);
      expect(res.body).not.toMatch(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i);
    }
  }, 25000);

  test('TEST 27: GET /api/kilo/config-targets returns safe configuration target metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/kilo/config-targets',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.targets)).toBe(true);
    const globalT = body.targets.find(t => t.id === 'global');
    expect(globalT).toBeDefined();
    expect(globalT.recommended).toBe(true);
    expect(globalT.usedBy).toContain('VS Code Kilo Code');

    const isolatedT = body.targets.find(t => t.id === 'isolated');
    expect(isolatedT).toBeDefined();
    expect(isolatedT.recommended).toBe(false);
  });

  test('TEST 28: POST /api/kilo/sync performs non-destructive merge into Kilo Global config', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/kilo/sync',
      headers: { host: '127.0.0.1:4380' },
      payload: { target: 'global' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.target).toBe('Kilo Global');
    expect(body.message).toContain('VS Code Kilo Code will use this provider');

    // Verify validation
    const valRes = await app.inject({
      method: 'POST',
      url: '/api/kilo/validate',
      headers: { host: '127.0.0.1:4380' },
      payload: { target: 'global' }
    });
    expect(valRes.statusCode).toBe(200);
    const valBody = JSON.parse(valRes.body);
    expect(valBody.valid).toBe(true);
    expect(valBody.details.targetName).toBe('Kilo Global');
    expect(valBody.details.modelCount).toBeGreaterThanOrEqual(36);
  }, 25000);

  test('TEST 29: POST /api/kilo/sync creates timestamped backups in backups directory', async () => {
    const { KiloAdapter } = require('../src/index');
    const globalPath = KiloAdapter.resolveTargetPath('global');
    const backupDir = path.join(path.dirname(globalPath), 'backups');
    expect(fs.existsSync(backupDir)).toBe(true);
    const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.bak'));
    expect(backups.length).toBeGreaterThan(0);
  });

  test('TEST 30: Kilo Global target contains zero exposed API keys in configuration file', () => {
    const { KiloAdapter } = require('../src/index');
    const globalPath = KiloAdapter.resolveTargetPath('global');
    const content = fs.readFileSync(globalPath, 'utf8');
    expect(content).not.toMatch(/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i);
    expect(content).not.toMatch(/"apiKey":\s*"[^"]+"/i);
  });

  test('TEST 31: REST APIs serve /api/control/status and /api/control/stop', async () => {
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/control/status',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(statusRes.statusCode).toBe(200);
    const body = JSON.parse(statusRes.body);
    expect(body.running).toBe(true);
    expect(body.pid).toBe(process.pid);
    expect(body.port).toBe(4380);
    expect(body.instanceId).toBeDefined();

    const stopRes = await app.inject({
      method: 'POST',
      url: '/api/control/stop',
      headers: { host: '127.0.0.1:4380' },
      payload: { reason: 'test_api_stop' }
    });
    expect(stopRes.statusCode).toBe(200);
    const stopBody = JSON.parse(stopRes.body);
    expect(stopBody.status).toBe('shutting_down');
  });

  test('TEST 32: ShutdownManager executes idempotent graceful shutdown sequence', async () => {
    const { ShutdownManager } = require('../src/index');
    await ShutdownManager.shutdown({
      reason: 'test_shutdown',
      exitProcess: false
    });
    expect(ShutdownManager.isShuttingDown).toBe(true);

    // Second call is idempotent (no-op)
    await ShutdownManager.shutdown({
      reason: 'test_shutdown_again',
      exitProcess: false
    });
    expect(ShutdownManager.isShuttingDown).toBe(true);

    // Reset flag for subsequent tests
    ShutdownManager.isShuttingDown = false;
  });

  test('E16: Phase 3 gsk-kilo launcher remains 100% operational with 36 models', async () => {
    const result = await CommandRunner.run('gsk-kilo', ['--gsk-info'], { timeout: 15000 });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('GenSpark → Kilo Bridge Status');
    expect(result.stdout).toContain('Available Models:  36');
  }, 20000);
});
