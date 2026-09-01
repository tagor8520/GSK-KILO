const KiloAdapter = require('../../adapters/kilo_adapter');
const logger = require('../../utils/logger');

async function kiloRoutes(fastify, options) {
  const lifecycleManager = options.lifecycleManager;

  /**
   * Enumerate available Kilo Configuration Targets
   */
  fastify.get('/api/kilo/config-targets', async (request, reply) => {
    return {
      targets: KiloAdapter.getConfigTargets()
    };
  });

  /**
   * Comprehensive Kilo Status
   */
  fastify.get('/api/kilo/status', async (request, reply) => {
    const target = request.query?.target || 'global';
    return await KiloAdapter.getDetailedStatus(target);
  });

  /**
   * Validate Kilo Configuration
   */
  fastify.post('/api/kilo/validate', async (request, reply) => {
    const target = request.body?.target || request.query?.target || 'global';
    logger.info(`Received API request to validate Kilo configuration (target: ${target})`);
    return await KiloAdapter.validateConfiguration(target);
  });

  /**
   * Synchronize Kilo Configuration safely
   */
  fastify.post('/api/kilo/sync', async (request, reply) => {
    const target = request.body?.target || 'global';
    logger.info(`Received API request to sync Kilo configuration to target: ${target}`);
    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      return await KiloAdapter.syncConfiguration(target);
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });

  /**
   * Explicit user-triggered test inference
   */
  fastify.post('/api/kilo/test', async (request, reply) => {
    const body = request.body || {};
    const modelId = body.modelId || 'genspark-llm-proxy/claude-sonnet-4-6';
    const prompt = body.prompt || 'Respond with exactly: GENSPARK_KILO_CONNECTION_OK';
    const target = body.target || 'global';

    logger.info(`Received API request to run explicit test on ${modelId} (target: ${target})`);
    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      const res = await KiloAdapter.testInference(modelId, prompt, target);
      if (!res.success) {
        reply.status(502);
      }
      return {
        ...res,
        target,
        warning: 'This performed a real GenSpark model inference request.',
        timestamp: new Date().toISOString()
      };
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });

  /**
   * Launch Kilo session
   */
  fastify.post('/api/kilo/launch', async (request, reply) => {
    logger.info('Received API request to launch Kilo');
    return await KiloAdapter.launchSession();
  });

  /**
   * List available models
   */
  fastify.get('/api/kilo/models', async (request, reply) => {
    const provider = request.query?.provider || null;
    const target = request.query?.target || 'global';
    const models = await KiloAdapter.getModels(provider, target);
    return {
      provider,
      target,
      count: models.length,
      models,
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = kiloRoutes;
