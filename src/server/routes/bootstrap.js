const BootstrapManager = require('../../services/bootstrap_manager');
const logger = require('../../utils/logger');

async function bootstrapRoutes(fastify, options) {
  const lifecycleManager = options.lifecycleManager;

  /**
   * Machine and Environment Detection API
   */
  fastify.get('/api/bootstrap/detect', async (request, reply) => {
    return await BootstrapManager.detectEnvironment();
  });

  /**
   * Safe Guided Prerequisite Setup API
   */
  fastify.post('/api/bootstrap/setup', async (request, reply) => {
    const body = request.body || {};
    const components = body.components || ['genspark', 'kilo', 'config'];
    logger.info(`Received API request to run guided setup for: ${components.join(', ')}`);

    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      return await BootstrapManager.setupPrerequisites(components);
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });

  /**
   * Export Machine-Independent Portable Profile
   */
  fastify.get('/api/bootstrap/profile/export', async (request, reply) => {
    const profile = BootstrapManager.exportProfile();
    reply.header('Content-Disposition', 'attachment; filename="gsk-kilo-profile.json"');
    reply.header('Content-Type', 'application/json');
    return profile;
  });

  /**
   * Import Machine-Independent Portable Profile
   */
  fastify.post('/api/bootstrap/profile/import', async (request, reply) => {
    const profileInput = request.body;
    logger.info('Received API request to import portable profile');
    const result = BootstrapManager.importProfile(profileInput);
    if (!result.success) {
      reply.status(400);
    }
    return result;
  });

  /**
   * Diagnostic Check & Safe Environment Repair API
   */
  fastify.post('/api/bootstrap/repair', async (request, reply) => {
    logger.info('Received API request to run diagnostic check and repair');
    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      return await BootstrapManager.checkAndRepair();
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });
}

module.exports = bootstrapRoutes;
