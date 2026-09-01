const ShutdownManager = require('../../services/shutdown_manager');
const { HOST } = require('../../config/paths');

async function controlRoutes(fastify, options) {
  const currentPort = options.port || 4380;
  const currentHost = options.host || HOST;
  const currentInstanceId = options.instanceId || 'unknown';

  /**
   * GET /api/control/status
   * Safe operational status endpoint
   */
  fastify.get('/api/control/status', async (request, reply) => {
    return {
      running: true,
      pid: process.pid,
      port: currentPort,
      host: currentHost,
      instanceId: currentInstanceId,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    };
  });

  /**
   * POST /api/control/stop
   * Graceful server shutdown endpoint
   */
  fastify.post('/api/control/stop', async (request, reply) => {
    const reason = request.body?.reason || 'gui_user_stop';
    
    // Schedule asynchronous shutdown after sending the response
    setTimeout(() => {
      ShutdownManager.shutdown({ exitCode: 0, reason, exitProcess: true });
    }, 100);

    return {
      status: 'shutting_down',
      message: 'GSK-KILO Control Plane is stopping gracefully',
      pid: process.pid,
      port: currentPort
    };
  });
}

module.exports = controlRoutes;
