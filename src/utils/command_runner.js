const { RESOLVED_PATH } = require('../config/paths');
const { sanitizeText } = require('./sanitize');
const logger = require('./logger');

class CommandRunner {
  /**
   * Resolve full binary path using Bun.which or PATH search
   * @param {string} binaryName 
   * @returns {string|null}
   */
  static which(binaryName) {
    if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') {
      const found = Bun.which(binaryName, { PATH: RESOLVED_PATH });
      if (found) return found;
    }

    // Fallback manual PATH search
    const fs = require('fs');
    const path = require('path');
    const dirs = RESOLVED_PATH.split(path.delimiter);
    for (const dir of dirs) {
      const candidate = path.join(dir, binaryName);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Skip inaccessible dirs
      }
    }
    return null;
  }

  /**
   * Safely execute an external binary with argv array, timeout, and output capture
   * @param {string} binaryName 
   * @param {string[]} args 
   * @param {object} options 
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number, timedOut: boolean }>}
   */
  static async run(binaryName, args = [], options = {}) {
    const timeoutMs = options.timeout ?? options.timeoutMs ?? 10000;
    const env = { ...process.env, PATH: RESOLVED_PATH, ...(options.env || {}) };
    const resolvedBin = CommandRunner.which(binaryName) || binaryName;

    if (typeof Bun !== 'undefined' && typeof Bun.spawn === 'function') {
      let proc = null;
      let timedOut = false;
      let timeoutTimer = null;

      try {
        proc = Bun.spawn([resolvedBin, ...args], {
          cwd: options.cwd || process.cwd(),
          env,
          stdout: 'pipe',
          stderr: 'pipe',
          stdin: 'ignore'
        });

        const timeoutPromise = new Promise((_, reject) => {
          timeoutTimer = setTimeout(() => {
            timedOut = true;
            try {
              proc.kill(9); // SIGKILL
            } catch {
              // Best-effort kill
            }
            reject(new Error(`Command timed out after ${timeoutMs}ms: ${binaryName}`));
          }, timeoutMs);
        });

        const executionPromise = (async () => {
          const stdoutText = await new Response(proc.stdout).text();
          const stderrText = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;
          return {
            stdout: sanitizeText(stdoutText.trim()),
            stderr: sanitizeText(stderrText.trim()),
            exitCode: exitCode ?? 0,
            timedOut: false
          };
        })();

        const result = await Promise.race([executionPromise, timeoutPromise]);
        clearTimeout(timeoutTimer);
        return result;
      } catch (err) {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        return {
          stdout: '',
          stderr: sanitizeText(err.message),
          exitCode: timedOut ? 124 : 1,
          timedOut
        };
      }
    } else {
      // Node.js fallback using child_process.spawn
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const child = spawn(resolvedBin, args, {
          cwd: options.cwd || process.cwd(),
          env,
          stdio: ['ignore', 'pipe', 'pipe']
        });

        const timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            stdout: sanitizeText(stdout.trim()),
            stderr: sanitizeText(stderr.trim()),
            exitCode: timedOut ? 124 : (code ?? 0),
            timedOut
          });
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          resolve({
            stdout: '',
            stderr: sanitizeText(err.message),
            exitCode: 1,
            timedOut: false
          });
        });
      });
    }
  }
}

module.exports = CommandRunner;
