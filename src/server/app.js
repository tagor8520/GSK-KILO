const Fastify = require('fastify');
const { sanitizeObject } = require('../utils/sanitize');
const logger = require('../utils/logger');
const rootRoutes = require('./routes/root');
const statusRoutes = require('./routes/status');
const systemRoutes = require('./routes/system');
const healthRoutes = require('./routes/health');
const heartbeatRoutes = require('./routes/heartbeat');
const gensparkRoutes = require('./routes/genspark');
const kiloRoutes = require('./routes/kilo');
const catalogRoutes = require('./routes/catalog');
const notificationRoutes = require('./routes/notifications');
const eventRoutes = require('./routes/events');
const controlRoutes = require('./routes/control');
const bootstrapRoutes = require('./routes/bootstrap');

/**
 * Build and configure the Fastify application instance
 * @param {object} options 
 * @returns {Fastify.FastifyInstance}
 */
function createApp(options = {}) {
  const app = Fastify({
    logger: false, // Use our custom structured & redacted logger
    trustProxy: false,
    ...options
  });

  const routeOptions = {
    port: options.port,
    host: options.host,
    instanceId: options.instanceId,
    lifecycleManager: options.lifecycleManager
  };

  // Security hook: Localhost host-header validation
  app.addHook('onRequest', async (request, reply) => {
    const hostHeader = request.headers.host || '';
    const host = hostHeader.split(':')[0].toLowerCase();
    const allowedHosts = ['127.0.0.1', 'localhost', '::1', ''];
    if (!allowedHosts.includes(host)) {
      logger.warn(`Rejected request with unauthorized Host header: ${hostHeader}`);
      reply.code(403).send({ error: 'Forbidden: Host header not permitted' });
      return reply;
    }
  });

  // Custom response headers
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-GSK-KILO-Control-Plane', 'active');
    reply.header('X-GSK-KILO-Runtime', typeof Bun !== 'undefined' ? 'bun' : 'node');
    return payload;
  });

  // Register Routes
  app.register(rootRoutes, routeOptions);
  app.register(statusRoutes, routeOptions);
  app.register(systemRoutes, routeOptions);
  app.register(healthRoutes, routeOptions);
  app.register(heartbeatRoutes, routeOptions);
  app.register(gensparkRoutes, routeOptions);
  app.register(kiloRoutes, routeOptions);
  app.register(catalogRoutes, routeOptions);
  app.register(notificationRoutes, routeOptions);
  app.register(eventRoutes, routeOptions);
  app.register(controlRoutes, routeOptions);
  app.register(bootstrapRoutes, routeOptions);

  // Safe Error Handler
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode || 500;
    logger.error(`Request error [${request.method} ${request.url}]: ${error.message}`);
    
    const safeResponse = {
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      statusCode,
      timestamp: new Date().toISOString()
    };

    reply.status(statusCode).send(sanitizeObject(safeResponse));
  });

  return app;
}

module.exports = {
  createApp
};
