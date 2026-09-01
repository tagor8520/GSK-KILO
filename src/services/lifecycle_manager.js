const { DEFAULT_IDLE_TIMEOUT } = require('../config/paths');
const logger = require('../utils/logger');

class LifecycleManager {
  constructor(options = {}) {
    this.idleTimeoutSec = options.idleTimeoutSec ?? DEFAULT_IDLE_TIMEOUT;
    this.lastDashboardSeen = Date.now();
    this.activeOperations = 0;
    this.activeChildProcesses = new Set();
    this.checkIntervalTimer = null;
    this.isShuttingDown = false;
  }

  /**
   * Record active browser heartbeat ping
   */
  recordHeartbeat() {
    this.lastDashboardSeen = Date.now();
    logger.debug('Received browser heartbeat');
  }

  /**
   * Increment in-flight operation counter
   */
  startOperation() {
    this.activeOperations++;
  }

  /**
   * Decrement in-flight operation counter
   */
  endOperation() {
    if (this.activeOperations > 0) {
      this.activeOperations--;
    }
  }

  /**
   * Register a monitored child process
   * @param {any} proc 
   */
  trackChildProcess(proc) {
    if (proc) {
      this.activeChildProcesses.add(proc);
    }
  }

  /**
   * Deregister a monitored child process
   * @param {any} proc 
   */
  untrackChildProcess(proc) {
    if (proc) {
      this.activeChildProcesses.delete(proc);
    }
  }

  /**
   * Start periodic idle check loop
   * @param {Function} shutdownCallback 
   * @param {number} intervalMs 
   */
  startIdleCheck(shutdownCallback, customIntervalMs = null) {
    if (this.idleTimeoutSec <= 0) {
      logger.info('Auto-shutdown idle timer disabled (GSK_KILO_IDLE_TIMEOUT=0)');
      return;
    }

    const intervalMs = customIntervalMs || Math.min(2500, Math.max(500, Math.floor((this.idleTimeoutSec * 1000) / 2)));
    logger.info(`Auto-shutdown idle timer enabled: ${this.idleTimeoutSec}s idle limit (interval: ${intervalMs}ms)`);
    this.checkIntervalTimer = setInterval(() => {
      if (this.isShuttingDown) return;

      const idleDurationMs = Date.now() - this.lastDashboardSeen;
      const idleLimitMs = this.idleTimeoutSec * 1000;

      const hasNoBrowser = idleDurationMs >= idleLimitMs;
      const hasNoActiveOps = this.activeOperations === 0;
      const hasNoActiveChildren = this.activeChildProcesses.size === 0;

      if (hasNoBrowser && hasNoActiveOps && hasNoActiveChildren) {
        this.isShuttingDown = true;
        logger.info(`Idle timeout reached (${Math.round(idleDurationMs / 1000)}s without active browser/operations). Initiating graceful auto-shutdown...`);
        this.stopIdleCheck();
        if (typeof shutdownCallback === 'function') {
          shutdownCallback();
        }
      }
    }, intervalMs);

    // Unref timer so it doesn't block event loop if other tasks finish
    if (this.checkIntervalTimer.unref) {
      this.checkIntervalTimer.unref();
    }
  }

  /**
   * Stop periodic idle check loop
   */
  stopIdleCheck() {
    if (this.checkIntervalTimer) {
      clearInterval(this.checkIntervalTimer);
      this.checkIntervalTimer = null;
    }
  }

  /**
   * Return current lifecycle state
   */
  getStatus() {
    const idleSeconds = Math.round((Date.now() - this.lastDashboardSeen) / 1000);
    return {
      autoCloseEnabled: this.idleTimeoutSec > 0,
      idleTimeoutSeconds: this.idleTimeoutSec,
      lastSeenSecondsAgo: idleSeconds,
      remainingSeconds: this.idleTimeoutSec > 0 ? Math.max(0, this.idleTimeoutSec - idleSeconds) : null,
      activeOperations: this.activeOperations,
      activeChildProcesses: this.activeChildProcesses.size
    };
  }
}

module.exports = LifecycleManager;
