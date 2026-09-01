const EventLedger = require('../../services/event_ledger');
const ErrorManager = require('../../services/error_manager');

async function eventRoutes(fastify, options) {
  fastify.get('/api/events', async (request, reply) => {
    const limit = parseInt(request.query?.limit || '50', 10);
    const events = EventLedger.getRecentEvents(limit);
    return {
      count: events.length,
      events,
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/api/errors', async (request, reply) => {
    const limit = parseInt(request.query?.limit || '50', 10);
    const errors = ErrorManager.getRecentErrors(limit);
    return {
      count: errors.length,
      errors,
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = eventRoutes;
