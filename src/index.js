const { startServer, stopServer } = require('./server/server');
const { getDatabase, closeDatabase } = require('./db/database');
const { runMigrations } = require('./db/migrations');
const paths = require('./config/paths');
const logger = require('./utils/logger');
const sanitize = require('./utils/sanitize');
const CommandRunner = require('./utils/command_runner');
const PortManager = require('./services/port_manager');
const InstanceLock = require('./services/instance_lock');
const InstanceManager = require('./services/instance_manager');
const ShutdownManager = require('./services/shutdown_manager');
const LifecycleManager = require('./services/lifecycle_manager');
const BrowserLauncher = require('./services/browser_launcher');

const GenSparkAdapter = require('./adapters/genspark_adapter');
const KiloAdapter = require('./adapters/kilo_adapter');
const CatalogSync = require('./services/catalog_sync');
const NotificationManager = require('./services/notification_manager');
const EventLedger = require('./services/event_ledger');
const ErrorManager = require('./services/error_manager');
const BootstrapManager = require('./services/bootstrap_manager');

module.exports = {
  startServer,
  stopServer,
  getDatabase,
  closeDatabase,
  runMigrations,
  paths,
  logger,
  sanitize,
  CommandRunner,
  PortManager,
  InstanceLock,
  InstanceManager,
  ShutdownManager,
  LifecycleManager,
  BrowserLauncher,
  GenSparkAdapter,
  KiloAdapter,
  CatalogSync,
  NotificationManager,
  EventLedger,
  ErrorManager,
  BootstrapManager
};

if (require.main === module || (typeof Bun !== 'undefined' && import.meta.main)) {
  const openBrowserArg = process.argv.includes('--open') || process.argv.includes('-o');
  startServer({ openBrowser: openBrowserArg }).then(result => {
    if (result && result.reused) {
      process.exit(0);
    }
  }).catch(err => {
    logger.error(`Application startup failure: ${err.message}`);
    process.exit(1);
  });
}
