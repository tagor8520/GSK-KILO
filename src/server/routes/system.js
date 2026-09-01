const os = require('os');
const { RUNTIME_DIR, DB_PATH, CONFIG_FILE } = require('../../config/paths');
const { getDatabase } = require('../../db/database');
const CommandRunner = require('../../utils/command_runner');

/**
 * Safely query CLI version using CommandRunner
 */
async function queryCli(binaryName, flag = '--version') {
  try {
    const result = await CommandRunner.run(binaryName, [flag], { timeout: 3000 });
    if (result.exitCode === 0 && result.stdout) {
      return {
        installed: true,
        version: result.stdout.replace(/^v/, '').split('\n')[0]
      };
    }
    return { installed: false, version: 'not_found' };
  } catch {
    return { installed: false, version: 'not_found' };
  }
}

async function systemRoutes(fastify, options) {
  fastify.get('/api/system', async (request, reply) => {
    let dbStatus = 'disconnected';
    let migrationCount = 0;

    try {
      const db = getDatabase();
      const rows = (db.prepare ? db.prepare('SELECT count(*) as count FROM _migrations') : db.query('SELECT count(*) as count FROM _migrations')).get();
      dbStatus = 'connected';
      migrationCount = rows ? rows.count : 0;
    } catch {
      dbStatus = 'error';
    }

    const [gskCli, kiloCli, nodeCli, npmCli, bunCli] = await Promise.all([
      queryCli('gsk'),
      queryCli('kilo'),
      queryCli('node'),
      queryCli('npm'),
      queryCli('bun')
    ]);

    return {
      os: {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname()
      },
      runtime: {
        engine: typeof Bun !== 'undefined' ? 'bun' : 'node',
        bunVersion: typeof Bun !== 'undefined' ? Bun.version : (bunCli.installed ? bunCli.version : null),
        nodeVersion: process.version,
        npmVersion: npmCli.installed ? npmCli.version : null,
        runtimeDir: RUNTIME_DIR,
        configFile: CONFIG_FILE,
        databasePath: DB_PATH,
        databaseStatus: dbStatus,
        appliedMigrations: migrationCount
      },
      cli: {
        gsk: gskCli,
        kilo: kiloCli,
        node: nodeCli,
        npm: npmCli,
        bun: bunCli
      },
      timestamp: new Date().toISOString()
    };
  });
}

module.exports = systemRoutes;
