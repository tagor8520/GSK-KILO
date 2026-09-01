const { getDatabase } = require('../../db/database');
const GenSparkAdapter = require('../../adapters/genspark_adapter');
const KiloAdapter = require('../../adapters/kilo_adapter');

async function healthRoutes(fastify, options) {
  const lifecycleManager = options.lifecycleManager;

  /**
   * Passive $0 health check (No model inference tokens consumed)
   */
  fastify.get('/api/health', async (request, reply) => {
    let dbStatus = 'ok';
    try {
      const db = getDatabase();
      const row = (db.prepare ? db.prepare('SELECT 1 as alive') : db.query('SELECT 1 as alive')).get();
      if (!row || row.alive !== 1) {
        dbStatus = 'degraded';
      }
    } catch {
      dbStatus = 'error';
    }

    const [gskHealth, kiloHealth] = await Promise.all([
      GenSparkAdapter.passiveHealthCheck(),
      KiloAdapter.health()
    ]);

    const isHealthy = dbStatus === 'ok' && gskHealth.status !== 'UNHEALTHY' && kiloHealth.status !== 'UNHEALTHY';

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      database: dbStatus,
      server: 'ok',
      engine: typeof Bun !== 'undefined' ? 'bun' : 'node',
      genspark: gskHealth,
      kilo: kiloHealth,
      timestamp: new Date().toISOString()
    };
  });

  /**
   * Active probe: Explicit user-initiated model request with usage/credit disclosure
   */
  fastify.post('/api/health/active', async (request, reply) => {
    const body = request.body || {};
    const modelId = body.modelId || 'genspark-llm-proxy/claude-sonnet-4-6';
    const prompt = body.prompt || 'Respond with exactly: GENSPARK_PROBE_OK';

    if (lifecycleManager) lifecycleManager.startOperation();
    try {
      const result = await GenSparkAdapter.activeProbe(modelId, prompt);
      if (!result.success) {
        reply.status(502);
      }
      return {
        ...result,
        warning: 'This performed a real GenSpark inference request.',
        timestamp: new Date().toISOString()
      };
    } finally {
      if (lifecycleManager) lifecycleManager.endOperation();
    }
  });
}

module.exports = healthRoutes;
