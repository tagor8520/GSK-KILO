const CatalogSync = require('../../services/catalog_sync');

async function catalogRoutes(fastify, options) {
  fastify.get('/api/providers', async (request, reply) => {
    let providers = CatalogSync.getProvidersFromDb();
    if (providers.length === 0) {
      await CatalogSync.syncAll();
      providers = CatalogSync.getProvidersFromDb();
    }
    return {
      count: providers.length,
      providers,
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/api/models', async (request, reply) => {
    const providerId = request.query?.provider || null;
    const limit = parseInt(request.query?.limit || '100', 10);
    const offset = parseInt(request.query?.offset || '0', 10);

    let models = CatalogSync.getModelsFromDb({ providerId, limit, offset });
    if (models.length === 0 && offset === 0) {
      await CatalogSync.syncAll();
      models = CatalogSync.getModelsFromDb({ providerId, limit, offset });
    }

    const totalCount = CatalogSync.getModelCount();

    return {
      total: totalCount,
      count: models.length,
      limit,
      offset,
      providerId,
      models,
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/api/endpoints', async (request, reply) => {
    let endpoints = CatalogSync.getEndpointsFromDb();
    if (endpoints.length === 0) {
      await CatalogSync.syncAll();
      endpoints = CatalogSync.getEndpointsFromDb();
    }
    return {
      count: endpoints.length,
      endpoints,
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = catalogRoutes;
