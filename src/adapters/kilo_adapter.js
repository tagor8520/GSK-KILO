const CommandRunner = require('../utils/command_runner');
const logger = require('../utils/logger');
const sanitize = require('../utils/sanitize');
const EventLedger = require('../services/event_ledger');
const NotificationManager = require('../services/notification_manager');
const paths = require('../config/paths');
const { parseJsonc } = require('../utils/jsonc');
const fs = require('fs');
const path = require('path');
const os = require('os');

class KiloAdapter {
  static TARGETS = {
    GLOBAL: 'global',
    ISOLATED: 'isolated',
    PROJECT: 'project',
    PROJECT_KILO: 'project-kilo'
  };

  /**
   * Check if Kilo CLI binary is installed and accessible on PATH
   * @returns {{ installed: boolean, binaryPath: string|null }}
   */
  static isInstalled() {
    const binaryPath = CommandRunner.which('kilo');
    return {
      installed: Boolean(binaryPath),
      binaryPath: binaryPath || null
    };
  }

  /**
   * Query the installed Kilo CLI version
   * @returns {Promise<{ version: string|null, raw: string|null }>}
   */
  static async getVersion() {
    const check = this.isInstalled();
    if (!check.installed) {
      return { version: null, raw: null };
    }

    const res = await CommandRunner.run('kilo', ['--version'], { timeoutMs: 8000 });
    if (res.exitCode === 0) {
      const match = res.stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : res.stdout.trim();
      return { version, raw: res.stdout.trim() };
    }
    return { version: null, raw: res.stderr || null };
  }

  /**
   * Enumerate available Kilo configuration targets
   * @returns {Array<object>}
   */
  static getConfigTargets() {
    const homeDir = os.homedir();
    const cwd = process.cwd();

    // 1. Global target (~/.config/kilo/kilo.jsonc or kilo.json)
    const globalJsonc = path.join(homeDir, '.config', 'kilo', 'kilo.jsonc');
    const globalJson = path.join(homeDir, '.config', 'kilo', 'kilo.json');
    let globalPath = globalJsonc;
    let globalExists = fs.existsSync(globalJsonc);
    if (!globalExists && fs.existsSync(globalJson)) {
      globalPath = globalJson;
      globalExists = true;
    }

    // 2. Isolated target (~/.config/kilo-genspark/kilo/kilo.json)
    const isolatedPath = paths.CONFIG_FILE;
    const isolatedExists = fs.existsSync(isolatedPath);

    // 3. Current Project (./kilo.jsonc or ./kilo.json)
    const projJsonc = path.join(cwd, 'kilo.jsonc');
    const projJson = path.join(cwd, 'kilo.json');
    let projPath = projJsonc;
    let projExists = fs.existsSync(projJsonc);
    if (!projExists && fs.existsSync(projJson)) {
      projPath = projJson;
      projExists = true;
    }

    // 4. Current Project (.kilo/kilo.jsonc or .kilo/kilo.json)
    const dotKiloJsonc = path.join(cwd, '.kilo', 'kilo.jsonc');
    const dotKiloJson = path.join(cwd, '.kilo', 'kilo.json');
    let dotKiloPath = dotKiloJsonc;
    let dotKiloExists = fs.existsSync(dotKiloJsonc);
    if (!dotKiloExists && fs.existsSync(dotKiloJson)) {
      dotKiloPath = dotKiloJson;
      dotKiloExists = true;
    }

    const targets = [
      {
        id: 'global',
        name: 'Kilo Global',
        displayPath: '~/.config/kilo/' + path.basename(globalPath),
        fullPath: globalPath,
        exists: globalExists,
        recommended: true,
        usedBy: ['Kilo CLI', 'VS Code Kilo Code']
      },
      {
        id: 'isolated',
        name: 'GSK-KILO Isolated',
        displayPath: '~/.config/kilo-genspark/kilo/kilo.json',
        fullPath: isolatedPath,
        exists: isolatedExists,
        recommended: false,
        usedBy: ['gsk-kilo Launcher']
      },
      {
        id: 'project',
        name: 'Current Project',
        displayPath: './' + path.basename(projPath),
        fullPath: projPath,
        exists: projExists,
        recommended: false,
        usedBy: ['Local Project Worktree']
      }
    ];

    if (dotKiloExists || fs.existsSync(path.join(cwd, '.kilo'))) {
      targets.push({
        id: 'project-kilo',
        name: 'Current Project (.kilo)',
        displayPath: './.kilo/' + path.basename(dotKiloPath),
        fullPath: dotKiloPath,
        exists: dotKiloExists,
        recommended: false,
        usedBy: ['Local Project (.kilo)']
      });
    }

    return targets;
  }

  /**
   * Resolve file system path for a given target identifier
   * @param {string} targetId 
   * @returns {string}
   */
  static resolveTargetPath(targetId = 'global') {
    const targets = this.getConfigTargets();
    const found = targets.find(t => t.id === targetId);
    if (found) return found.fullPath;
    const globalTarget = targets.find(t => t.id === 'global');
    return globalTarget ? globalTarget.fullPath : paths.CONFIG_FILE;
  }

  /**
   * Create a timestamped backup before modifying a configuration target
   * @param {string} targetPath 
   * @returns {string|null}
   */
  static backupConfig(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return null;
    try {
      const dir = path.dirname(targetPath);
      const backupDir = path.join(dir, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      }
      const timestamp = Date.now();
      const baseName = path.basename(targetPath);
      const backupPath = path.join(backupDir, `${baseName}.${timestamp}.bak`);
      fs.copyFileSync(targetPath, backupPath);
      fs.chmodSync(backupPath, 0o600);
      EventLedger.record('KILO_CONFIG_BACKUP', `Created backup for ${baseName}`, {
        originalPath: targetPath,
        backupPath
      });
      return backupPath;
    } catch (err) {
      logger.warn(`Failed to create config backup: ${err.message}`);
      return null;
    }
  }

  /**
   * Verify Kilo authentication and configured credentials using isolated runtime config
   * @returns {Promise<{ authenticated: boolean, credentialsCount: number, error?: string }>}
   */
  static async getAuthStatus() {
    const check = this.isInstalled();
    if (!check.installed) {
      return { authenticated: false, credentialsCount: 0, error: 'Kilo CLI not installed' };
    }

    const res = await CommandRunner.run('kilo', ['auth', 'list'], {
      timeoutMs: 12000,
      env: { XDG_CONFIG_HOME: paths.RUNTIME_DIR }
    });

    if (res.exitCode === 0) {
      const match = res.stdout.match(/(\d+)\s+credentials/i);
      const count = match ? parseInt(match[1], 10) : 1;
      return {
        authenticated: true,
        credentialsCount: count
      };
    }

    return {
      authenticated: false,
      credentialsCount: 0,
      error: res.stderr ? sanitize.redact(res.stderr.trim()) : 'Authentication check failed'
    };
  }

  /**
   * Inspect the status of a specific Kilo configuration target
   * @param {string} [targetId]
   * @returns {{ valid: boolean, path: string, exists: boolean, providerCount: number, targetId: string }}
   */
  static getConfigStatus(targetId = 'global') {
    const configPath = this.resolveTargetPath(targetId);
    if (!fs.existsSync(configPath)) {
      return { valid: false, path: configPath, exists: false, providerCount: 0, targetId };
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = parseJsonc(content);
      const providerCount = parsed && parsed.provider ? Object.keys(parsed.provider).length : 0;
      const hasGsk = Boolean(parsed && parsed.provider && parsed.provider['genspark-llm-proxy']);
      return {
        valid: Boolean(parsed && parsed.provider && providerCount > 0 && hasGsk),
        path: configPath,
        exists: true,
        providerCount,
        targetId
      };
    } catch {
      return { valid: false, path: configPath, exists: true, providerCount: 0, targetId };
    }
  }

  /**
   * Discover providers configured in Kilo's configuration
   * @param {string} [targetId]
   * @returns {Array<string>}
   */
  static getProviders(targetId = 'global') {
    const configPath = this.resolveTargetPath(targetId);
    if (!fs.existsSync(configPath)) return [];

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = parseJsonc(content);
      return Object.keys(parsed.provider || {});
    } catch {
      return [];
    }
  }

  /**
   * List available models in Kilo
   * @param {string} [providerId] 
   * @param {string} [targetId]
   * @returns {Promise<Array<string>>}
   */
  static async getModels(providerId = null, targetId = 'global') {
    const args = ['models'];
    if (providerId) {
      args.push(providerId);
    }

    const env = targetId === 'isolated'
      ? { XDG_CONFIG_HOME: paths.RUNTIME_DIR }
      : {};

    const res = await CommandRunner.run('kilo', args, {
      timeoutMs: 8000,
      env
    });

    if (res.exitCode === 0) {
      return res.stdout
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean);
    }
    return [];
  }

  /**
   * Launch a headless or interactive Kilo session safely
   * @param {Array<string>} args 
   * @param {object} [options] 
   * @returns {Promise<{ exitCode: number, stdout: string, stderr: string }>}
   */
  static async launch(args = [], options = {}) {
    EventLedger.record('KILO_STARTED', `Launching Kilo with arguments: ${args.join(' ')}`);
    const res = await CommandRunner.run('kilo', args, {
      ...options,
      env: {
        ...options.env,
        XDG_CONFIG_HOME: paths.RUNTIME_DIR
      }
    });

    EventLedger.record('KILO_STOPPED', `Kilo process finished with exit code ${res.exitCode}`);
    return res;
  }

  /**
   * Get comprehensive status of Kilo including provider, models, active model, and endpoint
   * @param {string} [targetId]
   * @returns {Promise<object>}
   */
  static async getDetailedStatus(targetId = 'global') {
    const [installedCheck, versionCheck, authStatus] = await Promise.all([
      Promise.resolve(this.isInstalled()),
      this.getVersion(),
      this.getAuthStatus()
    ]);

    const configStatus = this.getConfigStatus(targetId);
    const targetPath = this.resolveTargetPath(targetId);
    const targets = this.getConfigTargets();
    const currentTarget = targets.find(t => t.id === targetId) || targets[0];

    let defaultProvider = 'genspark-llm-proxy';
    let endpoint = 'https://www.genspark.ai/api/llm_proxy/v1';
    let activeModel = 'claude-sonnet-4-6';
    let modelCount = 0;
    const providerList = [];
    const modelList = [];

    if (configStatus.exists && fs.existsSync(targetPath)) {
      try {
        const content = fs.readFileSync(targetPath, 'utf8');
        const raw = parseJsonc(content);
        if (raw && raw.provider) {
          for (const [pId, pConfig] of Object.entries(raw.provider)) {
            providerList.push(pId);
            if (pId === 'genspark-llm-proxy' && pConfig.options?.baseURL) {
              endpoint = pConfig.options.baseURL;
            }
            if (pConfig.models) {
              for (const [mId, mDef] of Object.entries(pConfig.models)) {
                modelCount++;
                modelList.push({
                  id: mId,
                  fullId: `${pId}/${mId}`,
                  provider: pId,
                  name: mDef.name || mId
                });
              }
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    return {
      installed: installedCheck.installed,
      binaryPath: installedCheck.binaryPath,
      version: versionCheck.version,
      auth: authStatus,
      target: currentTarget,
      targets,
      config: {
        ...configStatus,
        endpoint,
        defaultProvider,
        activeModel,
        modelCount,
        usedBy: currentTarget.usedBy
      },
      providers: providerList.length > 0 ? providerList : ['genspark-llm-proxy', 'genspark-gemini-proxy'],
      models: modelList,
      activeModel,
      endpoint,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate Kilo configuration against all requirements
   * @param {string} [targetId]
   * @returns {Promise<{ valid: boolean, checks: object, details: object }>}
   */
  static async validateConfiguration(targetId = 'global') {
    const installedCheck = this.isInstalled();
    const versionCheck = await this.getVersion();
    const configPath = this.resolveTargetPath(targetId);
    const configExists = fs.existsSync(configPath);
    const targets = this.getConfigTargets();
    const currentTarget = targets.find(t => t.id === targetId) || targets[0];

    let configReadable = false;
    let providerConfigured = false;
    let endpointValid = false;
    let modelsConfigured = false;
    let modelCount = 0;
    let endpoint = 'https://www.genspark.ai/api/llm_proxy/v1';
    let providerId = 'genspark-llm-proxy';

    if (configExists) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        const raw = parseJsonc(content);
        configReadable = true;
        if (raw && raw.provider && raw.provider['genspark-llm-proxy']) {
          providerConfigured = true;
          const p = raw.provider['genspark-llm-proxy'];
          if (p.options?.baseURL && p.options.baseURL.startsWith('https://www.genspark.ai')) {
            endpointValid = true;
            endpoint = p.options.baseURL;
          }
          for (const prov of Object.values(raw.provider)) {
            if (prov && prov.models) {
              const count = Object.keys(prov.models).length;
              if (count > 0) modelsConfigured = true;
              modelCount += count;
            }
          }
        }
      } catch {
        configReadable = false;
      }
    }

    const checks = {
      kilo: installedCheck.installed,
      config: configReadable,
      provider: providerConfigured,
      endpoint: endpointValid,
      models: modelsConfigured
    };

    const valid = Object.values(checks).every(Boolean);

    EventLedger.record('KILO_CONFIG_VALIDATION', `Validated Kilo configuration (${currentTarget.name}): valid=${valid}`, {
      targetId,
      targetPath: configPath,
      checks
    });

    return {
      valid,
      target: currentTarget,
      checks,
      details: {
        targetId,
        targetPath: configPath,
        targetName: currentTarget.name,
        usedBy: currentTarget.usedBy,
        kiloVersion: versionCheck.version,
        providerId,
        endpoint,
        modelCount,
        activeModel: 'claude-sonnet-4-6'
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Safely synchronize GenSpark provider into the selected Kilo configuration target
   * Performs non-destructive merge and timestamped backup
   * @param {string} [targetId]
   * @returns {Promise<{ success: boolean, changed: boolean, target: string, message: string }>}
   */
  static async syncConfiguration(targetId = 'global') {
    EventLedger.record('KILO_CONFIG_SYNC_STARTED', `Started Kilo configuration sync to target: ${targetId}`);
    const CatalogSync = require('../services/catalog_sync');
    await CatalogSync.syncAll();

    const targetPath = this.resolveTargetPath(targetId);
    const targets = this.getConfigTargets();
    const currentTarget = targets.find(t => t.id === targetId) || targets[0];

    // 1. Get GenSpark provider definition from isolated config
    if (!fs.existsSync(paths.CONFIG_FILE)) {
      return {
        success: false,
        changed: false,
        target: currentTarget.name,
        message: 'Isolated GenSpark configuration not found. Please run gsk-kilo first.'
      };
    }

    const isolatedConfig = JSON.parse(fs.readFileSync(paths.CONFIG_FILE, 'utf8'));
    const gskLlmProvider = isolatedConfig.provider && isolatedConfig.provider['genspark-llm-proxy'];
    const gskGeminiProvider = isolatedConfig.provider && isolatedConfig.provider['genspark-gemini-proxy'];

    if (!gskLlmProvider) {
      return {
        success: false,
        changed: false,
        target: currentTarget.name,
        message: 'GenSpark provider definition missing in isolated template.'
      };
    }

    const apiKey = gskLlmProvider.options?.apiKey;

    // 2. Perform safe backup of destination file
    const backupPath = this.backupConfig(targetPath);

    // 3. Prepare merged configuration
    let mergedConfig = {};
    if (fs.existsSync(targetPath)) {
      try {
        const existingContent = fs.readFileSync(targetPath, 'utf8');
        mergedConfig = parseJsonc(existingContent);
      } catch (err) {
        logger.warn(`Could not parse existing target ${targetPath}: ${err.message}. Initializing clean config.`);
        mergedConfig = {};
      }
    }

    if (!mergedConfig['$schema']) {
      mergedConfig['$schema'] = 'https://kilo.ai/config.json';
    }

    mergedConfig.provider = mergedConfig.provider || {};

    // Clone provider object without putting naked API key directly in .jsonc if possible
    const cleanLlmProvider = JSON.parse(JSON.stringify(gskLlmProvider));
    delete cleanLlmProvider.options.apiKey;

    mergedConfig.provider['genspark-llm-proxy'] = cleanLlmProvider;

    if (gskGeminiProvider) {
      const cleanGeminiProvider = JSON.parse(JSON.stringify(gskGeminiProvider));
      delete cleanGeminiProvider.options.apiKey;
      mergedConfig.provider['genspark-gemini-proxy'] = cleanGeminiProvider;
    }

    // 4. Ensure target directory exists and write merged configuration
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true, mode: 0o755 });
    }

    fs.writeFileSync(targetPath, JSON.stringify(mergedConfig, null, 2));
    try {
      fs.chmodSync(targetPath, 0o600);
    } catch {}

    // 5. If updating global target, ensure Kilo's official auth.json store contains the provider key
    if (apiKey && (targetId === 'global' || targetId === 'project')) {
      try {
        const authPath = path.join(os.homedir(), '.local', 'share', 'kilo', 'auth.json');
        const authDir = path.dirname(authPath);
        if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
        let authStore = {};
        if (fs.existsSync(authPath)) {
          try {
            authStore = JSON.parse(fs.readFileSync(authPath, 'utf8'));
          } catch {}
        }
        authStore['genspark-llm-proxy'] = { type: 'api', key: apiKey };
        if (gskGeminiProvider) {
          authStore['genspark-gemini-proxy'] = { type: 'api', key: apiKey };
        }
        fs.writeFileSync(authPath, JSON.stringify(authStore, null, 2));
        fs.chmodSync(authPath, 0o600);
      } catch (err) {
        logger.warn(`Could not update ~/.local/share/kilo/auth.json: ${err.message}`);
      }
    }

    // 6. Validate the merged configuration
    const val = await this.validateConfiguration(targetId);
    if (!val.valid) {
      return {
        success: false,
        changed: true,
        target: currentTarget.name,
        message: 'Configuration merged, but validation reported incomplete components.'
      };
    }

    let successMsg = `Synced to ${currentTarget.name}.`;
    if (targetId === 'global') {
      successMsg = 'Synced to Kilo Global. VS Code Kilo Code will use this provider.';
    } else if (targetId === 'isolated') {
      successMsg = 'Synced to GSK-KILO isolated environment.';
    } else {
      successMsg = `Synced to ${currentTarget.name}.`;
    }

    NotificationManager.notify({
      type: 'SUCCESS',
      title: 'GenSpark Provider Synchronized',
      message: successMsg,
      component: 'KILO',
      dedupKey: `KILO_SYNC_${targetId.toUpperCase()}`
    });

    return {
      success: true,
      changed: true,
      target: currentTarget.name,
      targetId,
      backupPath,
      message: successMsg
    };
  }

  /**
   * Execute an explicit, user-initiated test inference request
   * @param {string} [modelId]
   * @param {string} [prompt]
   * @param {string} [targetId]
   * @returns {Promise<{ success: boolean, status: string, model: string, output?: string, error?: string, latencyMs: number }>}
   */
  static async testInference(
    modelId = 'genspark-llm-proxy/claude-sonnet-4-6',
    prompt = 'Respond with exactly: GENSPARK_KILO_CONNECTION_OK',
    targetId = 'global'
  ) {
    logger.warn(`[KILO TEST] Explicit user-initiated inference test on ${modelId} (target: ${targetId})`);
    EventLedger.record('KILO_TEST_INITIATED', `Explicit inference test on model ${modelId}`);

    const env = targetId === 'isolated'
      ? { XDG_CONFIG_HOME: paths.RUNTIME_DIR }
      : {};

    const start = Date.now();
    const res = await CommandRunner.run(
      'kilo',
      ['run', '--model', modelId, prompt],
      {
        timeoutMs: 35000,
        env
      }
    );

    const latencyMs = Date.now() - start;
    if (res.exitCode === 0 && (res.stdout.includes('GENSPARK_KILO_CONNECTION_OK') || res.stdout.includes('OK'))) {
      EventLedger.record('KILO_TEST_SUCCESS', `Inference test on ${modelId} succeeded in ${latencyMs}ms`);
      return {
        success: true,
        status: 'PASS',
        model: modelId,
        output: res.stdout.trim(),
        latencyMs
      };
    }

    EventLedger.record('KILO_TEST_FAILURE', `Inference test on ${modelId} failed`, {
      exitCode: res.exitCode,
      error: res.stderr
    });

    return {
      success: false,
      status: 'FAIL',
      model: modelId,
      error: res.stderr ? sanitize.redact(res.stderr.trim()) : 'Inference test failed or timed out',
      latencyMs
    };
  }

  /**
   * Launch Kilo session safely using argv without shell execution
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  static async launchSession() {
    const check = this.isInstalled();
    if (!check.installed) {
      return { success: false, message: 'Kilo is not installed on this system.' };
    }

    EventLedger.record('KILO_LAUNCH_CLICKED', 'User launched Kilo from dashboard');
    
    // Test that kilo responds
    const testCheck = await this.getVersion();
    if (testCheck.version) {
      return {
        success: true,
        message: 'Kilo is ready and available in terminal with gsk-kilo.'
      };
    }

    return {
      success: false,
      message: 'Failed to launch Kilo session.'
    };
  }

  /**
   * Passive health check for Kilo
   * @param {string} [targetId]
   * @returns {Promise<{ status: string, latencyMs: number, installed: boolean, version: string|null, configValid: boolean, providerCount: number }>}
   */
  static async health(targetId = 'global') {
    const start = Date.now();
    const [installedCheck, versionCheck, configStatus] = await Promise.all([
      Promise.resolve(this.isInstalled()),
      this.getVersion(),
      Promise.resolve(this.getConfigStatus(targetId))
    ]);

    const latencyMs = Date.now() - start;
    let status = 'HEALTHY';

    if (!installedCheck.installed) {
      status = 'UNHEALTHY';
    } else if (!configStatus.valid) {
      status = 'DEGRADED';
    }

    return {
      status,
      latencyMs,
      installed: installedCheck.installed,
      binaryPath: installedCheck.binaryPath,
      version: versionCheck.version,
      configValid: configStatus.valid,
      providerCount: configStatus.providerCount
    };
  }
}

module.exports = KiloAdapter;
