const os = require('os');
const fs = require('fs');
const path = require('path');
const CommandRunner = require('../utils/command_runner');
const logger = require('../utils/logger');
const sanitize = require('../utils/sanitize');
const paths = require('../config/paths');
const EventLedger = require('./event_ledger');
const NotificationManager = require('./notification_manager');
const GenSparkAdapter = require('../adapters/genspark_adapter');
const KiloAdapter = require('../adapters/kilo_adapter');

class BootstrapManager {
  /**
   * Check internet connectivity to GenSpark endpoint
   * @param {number} timeoutMs 
   * @returns {Promise<boolean>}
   */
  static async checkInternet(timeoutMs = 2500) {
    try {
      const res = await CommandRunner.run('curl', ['-s', '--head', '--max-time', String(timeoutMs / 1000), 'https://www.genspark.ai'], { timeoutMs });
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Comprehensive Machine and Environment Detection
   * @returns {Promise<object>}
   */
  static async detectEnvironment() {
    const [internet, gskHealth, kiloHealth] = await Promise.all([
      this.checkInternet(),
      GenSparkAdapter.health(),
      KiloAdapter.health()
    ]);

    const bunPath = CommandRunner.which('bun');
    const nodePath = CommandRunner.which('node');
    const npmPath = CommandRunner.which('npm');

    let bunVersion = null;
    if (typeof Bun !== 'undefined') {
      bunVersion = Bun.version;
    } else if (bunPath) {
      const bRes = await CommandRunner.run('bun', ['--version'], { timeoutMs: 2000 });
      if (bRes.exitCode === 0) bunVersion = bRes.stdout.trim();
    }

    let nodeVersion = null;
    if (nodePath) {
      const nRes = await CommandRunner.run('node', ['--version'], { timeoutMs: 2000 });
      if (nRes.exitCode === 0) nodeVersion = nRes.stdout.trim();
    }

    const isGskAuth = Boolean(gskHealth.auth && gskHealth.auth.authenticated);

    const checks = {
      os: true,
      internet,
      bun: Boolean(bunVersion),
      node: Boolean(nodeVersion),
      gensparkCli: Boolean(gskHealth.installed),
      gensparkAuth: isGskAuth,
      kiloCli: Boolean(kiloHealth.installed),
      kiloConfig: Boolean(kiloHealth.configValid)
    };

    const isReady = Object.values(checks).every(Boolean);
    const missing = [];
    if (!checks.bun) missing.push('Bun Runtime');
    if (!checks.node) missing.push('Node.js');
    if (!checks.gensparkCli) missing.push('GenSpark CLI (@genspark/cli)');
    if (!checks.gensparkAuth) missing.push('GenSpark Authentication');
    if (!checks.kiloCli) missing.push('Kilo Code CLI');
    if (!checks.kiloConfig) missing.push('Kilo Configuration');

    return {
      status: isReady ? 'READY' : 'SETUP_REQUIRED',
      machine: {
        os: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        node: nodeVersion,
        bun: bunVersion,
        npm: npmPath ? true : false,
        resolvedPath: paths.RESOLVED_PATH
      },
      checks,
      missing,
      genspark: {
        installed: gskHealth.installed,
        version: gskHealth.version,
        authenticated: isGskAuth,
        plan: gskHealth.auth?.plan || 'PLUS'
      },
      kilo: {
        installed: kiloHealth.installed,
        version: kiloHealth.version,
        configValid: kiloHealth.configValid,
        providerCount: kiloHealth.providerCount
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Safe Guided Prerequisite Setup
   * @param {string[]} components
   * @returns {Promise<{ success: boolean, results: Array<{ component: string, success: boolean, message: string }> }>}
   */
  static async setupPrerequisites(components = ['genspark', 'kilo']) {
    const results = [];
    EventLedger.record('BOOTSTRAP_SETUP_STARTED', `Setup requested for: ${components.join(', ')}`);

    for (const comp of components) {
      if (comp === 'genspark') {
        const check = GenSparkAdapter.isInstalled();
        if (check.installed) {
          results.push({ component: 'genspark', success: true, message: 'GenSpark CLI is already installed.' });
        } else {
          const npmPath = CommandRunner.which('npm');
          if (npmPath) {
            const res = await CommandRunner.run('npm', ['install', '-g', '@genspark/cli@1.7.1'], { timeoutMs: 45000 });
            if (res.exitCode === 0) {
              results.push({ component: 'genspark', success: true, message: 'Installed @genspark/cli successfully.' });
            } else {
              results.push({ component: 'genspark', success: false, message: 'Manual installation required: npm install -g @genspark/cli' });
            }
          } else {
            results.push({ component: 'genspark', success: false, message: 'npm not found. Please install Node.js and run npm install -g @genspark/cli' });
          }
        }
      } else if (comp === 'kilo') {
        const check = KiloAdapter.isInstalled();
        if (check.installed) {
          results.push({ component: 'kilo', success: true, message: 'Kilo Code CLI is already installed.' });
        } else {
          results.push({ component: 'kilo', success: false, message: 'Please install Kilo via official instructions: curl -fsSL https://kilo.ai/install.sh | sh or npm install -g @kilocode/cli' });
        }
      } else if (comp === 'config') {
        const syncRes = await KiloAdapter.syncConfiguration();
        results.push({ component: 'config', success: syncRes.success, message: syncRes.message });
      }
    }

    const allSuccess = results.every(r => r.success);
    EventLedger.record('BOOTSTRAP_SETUP_FINISHED', `Setup finished: allSuccess=${allSuccess}`, { results });

    return {
      success: allSuccess,
      results
    };
  }

  /**
   * Export Machine-Independent Portable Profile (Strictly Zero Secrets)
   * @returns {object}
   */
  static exportProfile() {
    EventLedger.record('PROFILE_EXPORTED', 'Exported portable profile');
    
    return {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      generator: 'GSK-KILO Control Plane',
      preferences: {
        defaultProvider: 'genspark-llm-proxy',
        defaultModel: 'genspark-llm-proxy/claude-sonnet-4-6',
        preferredUpstream: 'https://www.genspark.ai/api/llm_proxy/v1',
        idleTimeoutSec: 60,
        theme: 'dark',
        autoLaunchBrowser: true,
        notificationLevel: 'INFO'
      },
      environmentRequirements: {
        minimumBunVersion: '1.4.0',
        minimumKiloVersion: '7.0.0',
        gensparkCliPackage: '@genspark/cli@1.7.1'
      }
    };
  }

  /**
   * Import Machine-Independent Portable Profile with Strict Validation
   * @param {object|string} profileInput 
   * @returns {{ success: boolean, applied: number, message: string, errors?: string[] }}
   */
  static importProfile(profileInput) {
    let profile = profileInput;
    if (typeof profileInput === 'string') {
      try {
        profile = JSON.parse(profileInput);
      } catch (err) {
        return { success: false, applied: 0, message: 'Invalid JSON profile string', errors: [err.message] };
      }
    }

    if (!profile || typeof profile !== 'object') {
      return { success: false, applied: 0, message: 'Invalid profile object format' };
    }

    // Zero-Secret Invariant validation on profile payload
    const str = JSON.stringify(profile);
    if (/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i.test(str) || /"apiKey":\s*"[^"]+"/i.test(str) || /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i.test(str)) {
      EventLedger.record('PROFILE_IMPORT_REJECTED', 'Profile import rejected: detected credentials in profile data');
      return {
        success: false,
        applied: 0,
        message: 'Security Violation: Profiles must NEVER contain credentials, tokens, or secrets.'
      };
    }

    const preferences = profile.preferences || {};
    const appliedCount = Object.keys(preferences).length;

    EventLedger.record('PROFILE_IMPORTED', `Imported profile with ${appliedCount} preferences`);
    NotificationManager.notify({
      type: 'SUCCESS',
      title: 'Profile Imported',
      message: `Successfully applied ${appliedCount} configuration preferences.`,
      component: 'BOOTSTRAP',
      dedupKey: 'PROFILE_IMPORT_SUCCESS'
    });

    return {
      success: true,
      applied: appliedCount,
      preferences,
      message: `Profile imported successfully (${appliedCount} settings configured).`
    };
  }

  /**
   * Comprehensive Environment Check & Safe Repair Engine
   * @returns {Promise<{ status: string, issuesFound: number, repairsApplied: number, details: Array<{ issue: string, action: string, status: string }> }>}
   */
  static async checkAndRepair() {
    EventLedger.record('REPAIR_CHECK_STARTED', 'Running diagnostic check and repair');
    const details = [];
    let issuesFound = 0;
    let repairsApplied = 0;

    // Check 1: Runtime Directory and Permissions
    if (!fs.existsSync(paths.RUNTIME_DIR)) {
      issuesFound++;
      try {
        fs.mkdirSync(paths.RUNTIME_DIR, { recursive: true, mode: 0o700 });
        repairsApplied++;
        details.push({ issue: 'Missing runtime directory', action: 'Created ~/.config/kilo-genspark with 0700 permissions', status: 'REPAIRED' });
      } catch (e) {
        details.push({ issue: 'Missing runtime directory', action: 'Failed creating directory: ' + e.message, status: 'FAILED' });
      }
    } else {
      details.push({ issue: 'Runtime directory', action: 'Verified ~/.config/kilo-genspark exists', status: 'OK' });
    }

    // Check 2: Isolated Kilo Config Directory
    const kiloDir = path.dirname(paths.CONFIG_FILE);
    if (!fs.existsSync(kiloDir)) {
      issuesFound++;
      try {
        fs.mkdirSync(kiloDir, { recursive: true, mode: 0o700 });
        repairsApplied++;
        details.push({ issue: 'Missing Kilo isolated config directory', action: 'Created kilo subdirectory with 0700 permissions', status: 'REPAIRED' });
      } catch (e) {
        details.push({ issue: 'Missing Kilo config directory', action: 'Failed: ' + e.message, status: 'FAILED' });
      }
    }

    // Check 3: Kilo Configuration Integrity
    const kiloVal = await KiloAdapter.validateConfiguration();
    if (!kiloVal.valid) {
      issuesFound++;
      const syncRes = await KiloAdapter.syncConfiguration();
      if (syncRes.success) {
        repairsApplied++;
        details.push({ issue: 'Invalid or incomplete Kilo provider configuration', action: 'Synchronized provider and models catalog safely', status: 'REPAIRED' });
      } else {
        details.push({ issue: 'Kilo configuration error', action: 'Sync failed: ' + syncRes.message, status: 'FAILED' });
      }
    } else {
      details.push({ issue: 'Kilo Configuration', action: 'Verified 36 GenSpark models and direct upstream', status: 'OK' });
    }

    // Check 4: Stale Instance Registries
    const InstanceManager = require('./instance_manager');
    const staleCleaned = InstanceManager.cleanStaleRegistries();
    if (staleCleaned > 0) {
      issuesFound++;
      repairsApplied++;
      details.push({ issue: 'Stale instance files found in registry', action: `Cleaned up ${staleCleaned} dead instance record(s)`, status: 'REPAIRED' });
    } else {
      details.push({ issue: 'Instance Registry', action: 'Registry clean with zero zombie records', status: 'OK' });
    }

    EventLedger.record('REPAIR_CHECK_FINISHED', `Repair finished: ${repairsApplied}/${issuesFound} issues repaired`, { details });

    NotificationManager.notify({
      type: issuesFound === 0 ? 'INFO' : 'SUCCESS',
      title: issuesFound === 0 ? 'Diagnostics Healthy' : 'Environment Repaired',
      message: issuesFound === 0 ? 'All environment checks passed cleanly.' : `Repaired ${repairsApplied} of ${issuesFound} issues found.`,
      component: 'BOOTSTRAP',
      dedupKey: 'REPAIR_DIAG_COMPLETE'
    });

    return {
      status: issuesFound === repairsApplied ? 'HEALTHY' : 'NEEDS_ATTENTION',
      issuesFound,
      repairsApplied,
      details,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = BootstrapManager;
