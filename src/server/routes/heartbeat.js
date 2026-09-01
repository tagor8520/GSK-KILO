async function heartbeatRoutes(fastify, options) {
  const lifecycleManager = options.lifecycleManager;

  const handler = async (request, reply) => {
    if (lifecycleManager) {
      lifecycleManager.recordHeartbeat();
    }
    return {
      status: 'ok',
      lifecycle: lifecycleManager ? lifecycleManager.getStatus() : null,
      timestamp: new Date().toISOString()
    };
  };

  fastify.post('/api/heartbeat', handler);
  fastify.get('/api/heartbeat', handler);
}

module.exports = heartbeatRoutes;
