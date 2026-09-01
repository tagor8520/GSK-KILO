const { version } = require('../../../package.json');
const { HOST } = require('../../config/paths');

async function statusRoutes(fastify, options) {
  const currentPort = options.port || 4380;
  const currentHost = options.host || HOST;
  const currentInstanceId = options.instanceId || 'unknown';
  const lifecycleManager = options.lifecycleManager;

  fastify.get('/api/status', async (request, reply) => {
    return {
      application: 'gsk-kilo-control-plane',
      version,
      instanceId: currentInstanceId,
      pid: process.pid,
      status: 'ok',
      runtime: typeof Bun !== 'undefined' ? 'bun' : 'node',
      uptime: Math.round(process.uptime()),
      dashboard: {
        host: currentHost,
        port: currentPort,
        url: `http://${currentHost}:${currentPort}`
      },
      lifecycle: lifecycleManager ? lifecycleManager.getStatus() : null,
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = statusRoutes;
