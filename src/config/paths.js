const path = require('path');
const os = require('os');
const fs = require('fs');

const RUNTIME_DIR = process.env.GSK_KILO_RUNTIME_DIR || path.join(os.homedir(), '.config', 'kilo-genspark');
const DB_PATH = process.env.GSK_KILO_DB_PATH || path.join(RUNTIME_DIR, 'control.db');
const LOCK_FILE = path.join(RUNTIME_DIR, 'instance.json');
const INSTANCES_DIR = path.join(RUNTIME_DIR, 'instances');
const CONFIG_DIR = path.join(RUNTIME_DIR, 'kilo');
const CONFIG_FILE = path.join(CONFIG_DIR, 'kilo.json');
const GENSPARK_CLI_CONFIG = path.join(os.homedir(), '.genspark-tool-cli', 'config.json');

const DEFAULT_PORT = parseInt(process.env.GSK_KILO_PORT || '4380', 10);
const DEFAULT_IDLE_TIMEOUT = parseInt(process.env.GSK_KILO_IDLE_TIMEOUT ?? '60', 10);
const HOST = '127.0.0.1';

// Build complete PATH searching user global directories
const HOME = os.homedir();
const STANDARD_PATHS = [
  path.join(HOME, '.bun', 'bin'),
  path.join(HOME, '.npm-global', 'bin'),
  path.join(HOME, '.local', 'bin'),
  '/usr/local/bin',
  '/usr/bin',
  '/bin'
];
const RESOLVED_PATH = Array.from(
  new Set([...STANDARD_PATHS, ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)])
).join(path.delimiter);

/**
 * Ensure runtime directories exist with strict permissions (0700)
 */
function ensureDirectories() {
  const dirs = [RUNTIME_DIR, INSTANCES_DIR, CONFIG_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } else {
      try {
        fs.chmodSync(dir, 0o700);
      } catch {
        // Best-effort permission enforcement
      }
    }
  }
}

module.exports = {
  RUNTIME_DIR,
  DB_PATH,
  LOCK_FILE,
  INSTANCES_DIR,
  CONFIG_DIR,
  CONFIG_FILE,
  GENSPARK_CLI_CONFIG,
  DEFAULT_PORT,
  DEFAULT_IDLE_TIMEOUT,
  HOST,
  RESOLVED_PATH,
  ensureDirectories
};
