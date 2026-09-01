const NotificationManager = require('../../services/notification_manager');

async function notificationRoutes(fastify, options) {
  fastify.get('/api/notifications', async (request, reply) => {
    const active = NotificationManager.getActiveNotifications();
    const history = NotificationManager.getHistory(20);

    return {
      activeCount: active.length,
      active,
      history,
      timestamp: new Date().toISOString()
    };
  });

  fastify.post('/api/notifications/:id/dismiss', async (request, reply) => {
    const id = request.params.id;
    const success = NotificationManager.dismissNotification(id);
    return {
      success,
      notificationId: id,
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = notificationRoutes;
