const { closeDatabase } = require('../db/database');
const InstanceManager = require('./instance_manager');
const logger = require('../utils/logger');

class ShutdownManager {
  static isShuttingDown = false;
  static server = null;
  static lifecycleManager = null;
  static instanceId = null;
  static activePort = null;

  /**
   * Register active server context
   * @param {object} context 
   */
  static registerContext({ server, lifecycleManager, instanceId, port }) {
    this.server = server;
    this.lifecycleManager = lifecycleManager;
    this.instanceId = instanceId;
    this.activePort = port;
  }

  /**
   * Execute centralized graceful shutdown
   * @param {object} options 
   */
  static async shutdown(options = {}) {
    const { exitCode = 0, reason = 'manual', exitProcess = true } = options;

    if (this.isShuttingDown) {
      logger.debug('Shutdown already in progress, skipping duplicate invocation');
      return;
    }
    this.isShuttingDown = true;

    logger.info(`Initiating graceful GSK-KILO shutdown (reason: ${reason}, PID: ${process.pid})...`);

    // Safety fallback timer: force exit after 3000ms if something hangs
    let fallbackTimer = null;
    if (exitProcess) {
      fallbackTimer = setTimeout(() => {
        logger.warn('Graceful shutdown timed out after 3000ms. Forcing process exit.');
        process.exit(exitCode);
      }, 3000);
      if (fallbackTimer.unref) fallbackTimer.unref();
    }

    try {
      // 1. Stop background idle checks and timers
      if (this.lifecycleManager) {
        try {
          this.lifecycleManager.stopIdleCheck();
          logger.debug('Lifecycle idle monitor stopped');
        } catch (err) {
          logger.warn(`Error stopping lifecycle monitor: ${err.message}`);
        }
      }

      // 2. Close Fastify web server
      if (this.server) {
        try {
          await this.server.close();
          logger.info('Fastify server closed cleanly');
        } catch (err) {
          logger.warn(`Error closing Fastify server: ${err.message}`);
        } finally {
          this.server = null;
        }
      }

      // 3. Unregister instance from registry
      try {
        InstanceManager.unregisterInstance(this.instanceId);
        logger.debug('Instance unregistered from registry');
      } catch (err) {
        logger.warn(`Error unregistering instance: ${err.message}`);
      }

      // 4. Close SQLite database connection
      try {
        closeDatabase();
        logger.debug('SQLite database closed cleanly');
      } catch (err) {
        logger.warn(`Error closing SQLite database: ${err.message}`);
      }

      logger.info('GSK-KILO Control Plane shut down successfully');
    } catch (err) {
      logger.error(`Error during shutdown sequence: ${err.message}`);
    } finally {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (exitProcess) {
        process.exit(exitCode);
      }
    }
  }

  /**
   * Attach process signal handlers
   */
  static attachSignalHandlers() {
    const handleSignal = (signal) => {
      logger.info(`Received OS signal ${signal}`);
      this.shutdown({ exitCode: 0, reason: `signal_${signal}`, exitProcess: true });
    };

    process.once('SIGINT', () => handleSignal('SIGINT'));
    process.once('SIGTERM', () => handleSignal('SIGTERM'));
  }
}

module.exports = ShutdownManager;
