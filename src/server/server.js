const { createApp } = require('./app');
const { getDatabase } = require('../db/database');
const { runMigrations } = require('../db/migrations');
const { DEFAULT_PORT, DEFAULT_IDLE_TIMEOUT, HOST, DB_PATH, RUNTIME_DIR } = require('../config/paths');
const PortManager = require('../services/port_manager');
const InstanceManager = require('../services/instance_manager');
const ShutdownManager = require('../services/shutdown_manager');
const LifecycleManager = require('../services/lifecycle_manager');
const BrowserLauncher = require('../services/browser_launcher');
const logger = require('../utils/logger');

let activeLifecycleManager = null;

/**
 * Start the GSK-KILO Control Plane server
 * @param {object} options
 */
async function startServer(options = {}) {
  const desiredPort = options.port || DEFAULT_PORT;
  const desiredHost = options.host || HOST;
  const idleTimeoutSec = options.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT;
  const openBrowser = options.openBrowser ?? false;

  // 1. Single Instance Check: Search for and validate any existing healthy instances
  const existing = await InstanceManager.findActiveHealthyInstance();
  if (existing.running && existing.instance) {
    logger.info(`GSK-KILO Control Plane is already active at ${existing.instance.url} (PID ${existing.instance.pid})`);
    if (openBrowser) {
      await BrowserLauncher.open(existing.instance.url);
    }
    return {
      reused: true,
      instance: existing.instance,
      url: existing.instance.url,
      port: existing.instance.port
    };
  }

  try {
    logger.info('Initializing GSK-KILO Control Plane (Bun runtime)...');
    logger.info(`Runtime directory: ${RUNTIME_DIR}`);
    logger.info(`Database location: ${DB_PATH}`);

    // 2. Initialize Database & Run Migrations
    const db = getDatabase();
    const migrationResult = runMigrations(db);
    logger.info(`Database initialized with ${migrationResult.appliedCount} new migrations applied`);

    // 3. Port Discovery (Collision avoidance)
    const actualPort = await PortManager.findAvailablePort(desiredPort, 50, desiredHost);
    const dashboardUrl = `http://${desiredHost}:${actualPort}`;
    const instanceId = InstanceManager.generateInstanceId();

    // 4. Initialize Lifecycle Manager
    const lifecycleManager = new LifecycleManager({ idleTimeoutSec });
    activeLifecycleManager = lifecycleManager;

    // 5. Create Fastify App
    const app = createApp({
      port: actualPort,
      host: desiredHost,
      instanceId,
      lifecycleManager
    });

    // 6. Register context with centralized ShutdownManager
    ShutdownManager.registerContext({
      server: app,
      lifecycleManager,
      instanceId,
      port: actualPort
    });
    ShutdownManager.attachSignalHandlers();

    await app.listen({ port: actualPort, host: desiredHost });
    logger.info(`GSK-KILO Control Plane listening on ${dashboardUrl}`);

    // 7. Register Instance in Registry & Lock File
    InstanceManager.registerInstance({
      instanceId,
      host: desiredHost,
      port: actualPort,
      url: dashboardUrl
    });

    // 8. Start Idle Auto-Shutdown Monitor
    lifecycleManager.startIdleCheck(async () => {
      logger.info('Auto-shutdown triggered by idle monitor');
      await ShutdownManager.shutdown({ exitCode: 0, reason: 'idle_timeout', exitProcess: true });
    });

    // 9. Open browser if requested
    if (openBrowser) {
      await BrowserLauncher.open(dashboardUrl);
    }

    return {
      reused: false,
      app,
      host: desiredHost,
      port: actualPort,
      url: dashboardUrl,
      instanceId,
      lifecycleManager
    };
  } catch (err) {
    logger.error(`Fatal startup error: ${err.message}`);
    await ShutdownManager.shutdown({ exitCode: 1, reason: 'startup_error', exitProcess: false });
    throw err;
  }
}

/**
 * Stop active server cleanly via centralized ShutdownManager
 */
async function stopServer(options = {}) {
  return ShutdownManager.shutdown({
    exitCode: options.exitCode || 0,
    reason: options.reason || 'programmatic_stop',
    exitProcess: options.exitProcess ?? false
  });
}

module.exports = {
  startServer,
  stopServer
};
