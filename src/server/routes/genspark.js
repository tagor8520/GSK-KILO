const GenSparkAdapter = require('../../adapters/genspark_adapter');
const CatalogSync = require('../../services/catalog_sync');
const logger = require('../../utils/logger');

async function gensparkRoutes(fastify, options) {
  const lifecycleManager = options.lifecycleManager;

  fastify.get('/api/genspark/status', async (request, reply) => {
    const [installedCheck, versionCheck, authStatus] = await Promise.all([
      Promise.resolve(GenSparkAdapter.isInstalled()),
      GenSparkAdapter.getVersion(),
      GenSparkAdapter.getLoginStatus()
    ]);

    return {
      installed: installedCheck.installed,
      binaryPath: installedCheck.binaryPath,
      version: versionCheck.version,
      auth: authStatus,
      timestamp: new Date().toISOString()
    };
  });

  fastify.post('/api/genspark/login', async (request, reply) => {
    logger.info('Received API request to initiate GenSpark login');
    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      const result = await GenSparkAdapter.login();
      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });

  fastify.post('/api/genspark/logout', async (request, reply) => {
    logger.info('Received API request to log out from GenSpark');
    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      const result = await GenSparkAdapter.logout();
      return {
        ...result,
        timestamp: new Date().toISOString()
      };
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });

  fastify.post('/api/genspark/sync', async (request, reply) => {
    logger.info('Received API request to sync GenSpark catalog');
    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      const result = await CatalogSync.syncAll();
      return {
        status: 'ok',
        ...result,
        timestamp: new Date().toISOString()
      };
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });
}

module.exports = gensparkRoutes;
