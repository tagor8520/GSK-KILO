const os = require('os');
const CommandRunner = require('../utils/command_runner');
const logger = require('../utils/logger');

class BrowserLauncher {
  /**
   * Attempt to open a URL in the user's default browser
   * @param {string} url 
   * @returns {Promise<{ launched: boolean, method: string|null, url: string }>}
   */
  static async open(url) {
    const platform = os.platform();
    let bin = null;
    let args = [];

    if (platform === 'linux') {
      bin = 'xdg-open';
      args = [url];
    } else if (platform === 'darwin') {
      bin = 'open';
      args = [url];
    } else if (platform === 'win32') {
      bin = 'cmd.exe';
      args = ['/c', 'start', '""', url];
    }

    if (!bin) {
      logger.warn(`Browser launcher not supported for platform: ${platform}. Dashboard URL: ${url}`);
      return { launched: false, method: null, url };
    }

    const resolved = CommandRunner.which(bin);
    if (!resolved && platform !== 'win32') {
      logger.warn(`Browser launcher binary '${bin}' not found on PATH. Dashboard URL: ${url}`);
      return { launched: false, method: null, url };
    }

    try {
      // Fire and forget browser spawn
      if (typeof Bun !== 'undefined' && typeof Bun.spawn === 'function') {
        const proc = Bun.spawn([resolved || bin, ...args], {
          stdout: 'ignore',
          stderr: 'ignore',
          stdin: 'ignore'
        });
        if (proc.unref) proc.unref();
      } else {
        const { spawn } = require('child_process');
        const child = spawn(resolved || bin, args, { stdio: 'ignore', detached: true });
        child.unref();
      }

      logger.info(`Opened default browser at ${url} using ${bin}`);
      return { launched: true, method: bin, url };
    } catch (err) {
      logger.warn(`Failed to spawn browser launcher (${bin}): ${err.message}. Dashboard URL: ${url}`);
      return { launched: false, method: bin, url };
    }
  }
}

module.exports = BrowserLauncher;
