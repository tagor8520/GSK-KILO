const fs = require('fs');
const path = require('path');
const http = require('http');
const { INSTANCES_DIR, LOCK_FILE, ensureDirectories } = require('../config/paths');
const logger = require('../utils/logger');

class InstanceManager {
  /**
   * Generate a unique non-secret instance identifier
   * @returns {string}
   */
  static generateInstanceId() {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `gsk_inst_${timestamp}_${rand}`;
  }

  /**
   * Check if a PID is alive on the operating system
   * @param {number} pid 
   * @returns {boolean}
   */
  static isProcessAlive(pid) {
    if (!pid || typeof pid !== 'number') return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verify on Linux if PID cmdline matches GSK-KILO control plane
   * @param {number} pid 
   * @returns {boolean}
   */
  static isProcessGskKilo(pid) {
    if (!this.isProcessAlive(pid)) return false;
    try {
      const procPath = `/proc/${pid}/cmdline`;
      if (fs.existsSync(procPath)) {
        const cmdline = fs.readFileSync(procPath, 'utf8').replace(/\0/g, ' ');
        const matches = cmdline.includes('genspark_api') ||
                        cmdline.includes('gsk-kilo-control-plane') ||
                        cmdline.includes('src/index.js') ||
                        cmdline.includes('gsk-kilo');
        return matches;
      }
    } catch {
      // If /proc is not accessible (or permission error), fallback to true to allow HTTP check
    }
    return true;
  }

  /**
   * Probe HTTP status of an instance candidate
   * @param {string} host 
   * @param {number} port 
   * @param {number} timeoutMs 
   * @returns {Promise<{ ok: boolean, data?: object }>}
   */
  static probeInstanceStatus(host = '127.0.0.1', port, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const req = http.get(`http://${host}:${port}/api/status`, { timeout: timeoutMs }, (res) => {
        if (res.statusCode === 200) {
          let raw = '';
          res.on('data', chunk => { raw += chunk; });
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              if (data && (data.application === 'gsk-kilo-control-plane' || data.status === 'ok')) {
                return resolve({ ok: true, data });
              }
              resolve({ ok: false });
            } catch {
              resolve({ ok: false });
            }
          });
        } else {
          res.resume();
          resolve({ ok: false });
        }
      });

      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false });
      });
    });
  }

  /**
   * Discover all instance candidate records from disk
   * @returns {Array<object>}
   */
  static discoverCandidateRecords() {
    ensureDirectories();
    const candidates = [];
    const seenKeys = new Set();

    const addCandidate = (record, filePath) => {
      if (!record || typeof record.pid !== 'number') return;
      const key = `${record.pid}:${record.port || 4380}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({ ...record, _filePath: filePath });
      }
    };

    // 1. Read instances/ directory
    if (fs.existsSync(INSTANCES_DIR)) {
      try {
        const files = fs.readdirSync(INSTANCES_DIR);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const fullPath = path.join(INSTANCES_DIR, file);
            try {
              const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
              addCandidate(parsed, fullPath);
            } catch {
              // Corrupt candidate file -> remove
              try { fs.unlinkSync(fullPath); } catch {}
            }
          }
        }
      } catch (err) {
        logger.warn(`Error reading instances directory: ${err.message}`);
      }
    }

    // 2. Read legacy/convenience instance.json
    if (fs.existsSync(LOCK_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        addCandidate(parsed, LOCK_FILE);
      } catch {
        try { fs.unlinkSync(LOCK_FILE); } catch {}
      }
    }

    return candidates;
  }

  /**
   * Validate a candidate instance (PID + cmdline + HTTP health)
   * @param {object} candidate 
   * @returns {Promise<{ valid: boolean, data?: object, reason?: string }>}
   */
  static async validateCandidate(candidate) {
    if (!this.isProcessAlive(candidate.pid)) {
      return { valid: false, reason: 'pid_dead' };
    }

    if (!this.isProcessGskKilo(candidate.pid)) {
      return { valid: false, reason: 'unrelated_process' };
    }

    const probe = await this.probeInstanceStatus(candidate.host || '127.0.0.1', candidate.port);
    if (!probe.ok) {
      return { valid: false, reason: 'http_health_failed' };
    }

    // Validate instance ID or PID from status response if available
    if (candidate.instanceId && probe.data?.instanceId && candidate.instanceId !== probe.data.instanceId) {
      return { valid: false, reason: 'instance_id_mismatch' };
    }

    return { valid: true, data: probe.data };
  }

  /**
   * Find an active, healthy GSK-KILO instance or clean up stale instances
   * Enforces the startup state machine
   * @returns {Promise<{ running: boolean, instance: object|null }>}
   */
  static async findActiveHealthyInstance() {
    const candidates = this.discoverCandidateRecords();
    const validInstances = [];
    const staleFiles = [];

    // Also probe default port 4380 if no candidate recorded on 4380
    const has4380 = candidates.some(c => (c.port || 4380) === 4380);
    if (!has4380) {
      const probe4380 = await this.probeInstanceStatus('127.0.0.1', 4380, 1000);
      if (probe4380.ok && probe4380.data?.pid) {
        candidates.push({
          instanceId: probe4380.data.instanceId || 'discovered_4380',
          pid: probe4380.data.pid,
          host: '127.0.0.1',
          port: 4380,
          url: 'http://127.0.0.1:4380',
          startedAt: probe4380.data.timestamp || new Date().toISOString()
        });
      }
    }

    for (const candidate of candidates) {
      const validation = await this.validateCandidate(candidate);
      if (validation.valid) {
        validInstances.push({
          instanceId: candidate.instanceId || validation.data?.instanceId,
          pid: candidate.pid,
          host: candidate.host || '127.0.0.1',
          port: candidate.port,
          url: candidate.url || `http://${candidate.host || '127.0.0.1'}:${candidate.port}`,
          startedAt: candidate.startedAt || new Date().toISOString(),
          version: candidate.version || validation.data?.version
        });
      } else {
        if (candidate._filePath && fs.existsSync(candidate._filePath)) {
          staleFiles.push(candidate._filePath);
        }
      }
    }

    // Clean up stale registry files
    for (const staleFile of staleFiles) {
      try {
        fs.unlinkSync(staleFile);
        logger.debug(`Cleaned stale instance file: ${staleFile}`);
      } catch {}
    }

    if (validInstances.length === 0) {
      return { running: false, instance: null };
    }

    // Sort valid instances by newest (latest startedAt or highest PID)
    validInstances.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    const winner = validInstances[0];

    // If multiple valid instances exist, safely terminate excess verified duplicates
    if (validInstances.length > 1) {
      const duplicates = validInstances.slice(1);
      logger.warn(`Found ${duplicates.length} duplicate GSK-KILO instances. Terminating excess duplicates...`);
      for (const dup of duplicates) {
        if (dup.pid !== process.pid && dup.pid !== winner.pid) {
          try {
            logger.info(`Terminating duplicate GSK-KILO instance PID ${dup.pid} on port ${dup.port}`);
            process.kill(dup.pid, 'SIGTERM');
          } catch (err) {
            logger.warn(`Could not terminate duplicate PID ${dup.pid}: ${err.message}`);
          }
        }
      }
    }

    logger.info(`Found active GSK-KILO Control Plane at ${winner.url} (PID ${winner.pid})`);
    return {
      running: true,
      instance: winner
    };
  }

  /**
   * Register a new running instance in registry and lock file
   * @param {object} instanceData 
   */
  static registerInstance(instanceData) {
    ensureDirectories();
    const data = {
      instanceId: instanceData.instanceId || this.generateInstanceId(),
      pid: process.pid,
      host: instanceData.host || '127.0.0.1',
      port: instanceData.port,
      url: instanceData.url || `http://${instanceData.host || '127.0.0.1'}:${instanceData.port}`,
      startedAt: instanceData.startedAt || new Date().toISOString(),
      version: instanceData.version || '1.0.0'
    };

    const instanceFilePath = path.join(INSTANCES_DIR, `${data.instanceId}.json`);
    fs.writeFileSync(instanceFilePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.writeFileSync(LOCK_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
    logger.debug(`Registered instance ${data.instanceId} (PID ${process.pid}) at ${instanceFilePath}`);
    return data;
  }

  /**
   * Unregister an instance on shutdown
   * @param {string} instanceId 
   */
  static unregisterInstance(instanceId) {
    try {
      if (instanceId) {
        const instanceFilePath = path.join(INSTANCES_DIR, `${instanceId}.json`);
        if (fs.existsSync(instanceFilePath)) {
          fs.unlinkSync(instanceFilePath);
          logger.debug(`Unregistered instance file: ${instanceFilePath}`);
        }
      }
      if (fs.existsSync(LOCK_FILE)) {
        try {
          const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
          if (lockData.pid === process.pid || (instanceId && lockData.instanceId === instanceId)) {
            fs.unlinkSync(LOCK_FILE);
            logger.debug(`Released lock file: ${LOCK_FILE}`);
          }
        } catch {
          fs.unlinkSync(LOCK_FILE);
        }
      }
    } catch (err) {
      logger.warn(`Error unregistering instance: ${err.message}`);
    }
  }

  /**
   * Clean all stale/dead candidate records from registry directory
   * @returns {number} count of cleaned files
   */
  static cleanStaleRegistries() {
    let count = 0;
    try {
      const candidates = this.discoverCandidateRecords();
      for (const candidate of candidates) {
        if (!this.isProcessAlive(candidate.pid)) {
          if (candidate._filePath && fs.existsSync(candidate._filePath)) {
            try {
              fs.unlinkSync(candidate._filePath);
              count++;
            } catch {}
          }
        }
      }
    } catch {}
    return count;
  }
}

module.exports = InstanceManager;
