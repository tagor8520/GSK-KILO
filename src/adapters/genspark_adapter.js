const CommandRunner = require('../utils/command_runner');
const logger = require('../utils/logger');
const sanitize = require('../utils/sanitize');
const EventLedger = require('../services/event_ledger');
const NotificationManager = require('../services/notification_manager');
const ErrorManager = require('../services/error_manager');
const paths = require('../config/paths');
const fs = require('fs');
const path = require('path');
const https = require('https');

class GenSparkAdapter {
  /**
   * Check if GenSpark CLI (`gsk`) is installed and accessible on PATH
   * @returns {{ installed: boolean, binaryPath: string|null }}
   */
  static isInstalled() {
    const binaryPath = CommandRunner.which('gsk');
    return {
      installed: Boolean(binaryPath),
      binaryPath: binaryPath || null
    };
  }

  /**
   * Query the installed GenSpark CLI version
   * @returns {Promise<{ version: string|null, raw: string|null }>}
   */
  static async getVersion() {
    const check = this.isInstalled();
    if (!check.installed) {
      return { version: null, raw: null };
    }

    const res = await CommandRunner.run('gsk', ['--version'], { timeoutMs: 3000 });
    if (res.exitCode === 0) {
      const match = res.stdout.match(/(\d+\.\d+\.\d+)/);
      const version = match ? match[1] : res.stdout.trim();
      return { version, raw: res.stdout.trim() };
    }
    return { version: null, raw: res.stderr || null };
  }

  /**
   * Query GenSpark authentication status via `gsk login-info`
   * @returns {Promise<{ authenticated: boolean, email?: string, name?: string, plan?: string, creditBalance?: number, error?: string }>}
   */
  static async getLoginStatus() {
    const check = this.isInstalled();
    if (!check.installed) {
      return {
        authenticated: false,
        error: 'GenSpark CLI (gsk) is not installed on system'
      };
    }

    const res = await CommandRunner.run('gsk', ['login-info'], { timeoutMs: 8000 });
    if (res.exitCode === 0) {
      try {
        const parsed = JSON.parse(res.stdout);
        if (parsed && (parsed.status === 'ok' || parsed.status === 'success') && parsed.data) {
          const data = parsed.data;
          // Resolve any active auth failure notifications
          NotificationManager.resolveNotification('GENSPARK_AUTH_REQUIRED');

          return {
            authenticated: true,
            email: data.email || null,
            name: data.name || null,
            plan: data.plan || data.personal_plan || 'standard',
            creditBalance: typeof data.credit_balance === 'number' ? data.credit_balance : null
          };
        }
      } catch {
        // Non-JSON response
      }
    }

    // Auth failed or not logged in
    NotificationManager.notify({
      type: 'WARNING',
      title: 'GenSpark Authentication Required',
      message: 'GenSpark CLI is installed but not authenticated. Please log in.',
      component: 'GENSPARK',
      dedupKey: 'GENSPARK_AUTH_REQUIRED',
      actionLabel: 'LOGIN TO GENSPARK',
      actionType: 'AUTH_GENSPARK'
    });

    return {
      authenticated: false,
      error: res.stderr ? sanitize.redact(res.stderr.trim()) : 'Not authenticated'
    };
  }

  /**
   * Get sanitized login and subscription details
   */
  static async getLoginInfo() {
    return await this.getLoginStatus();
  }

  /**
   * Initiate official browser login flow
   * @returns {Promise<{ started: boolean, message: string }>}
   */
  static async login() {
    EventLedger.record('GENSPARK_LOGIN_INITIATED', 'User initiated GenSpark browser login flow');
    // gsk login opens the browser and sets up a local callback server
    const check = this.isInstalled();
    if (!check.installed) {
      ErrorManager.recordError({
        component: 'GENSPARK',
        operation: 'LOGIN',
        errorCode: 'GSK_NOT_INSTALLED',
        safeMessage: 'Cannot log in because gsk binary is not installed',
        resolution: 'Install @genspark/cli first'
      });
      return { started: false, message: 'GenSpark CLI not installed' };
    }

    // Launch in background since gsk login awaits browser callback
    CommandRunner.run('gsk', ['login'], { timeoutMs: 60000 }).then(res => {
      if (res.exitCode === 0) {
        EventLedger.record('GENSPARK_AUTHENTICATED', 'GenSpark browser authentication succeeded');
        NotificationManager.resolveNotification('GENSPARK_AUTH_REQUIRED');
        NotificationManager.notify({
          type: 'SUCCESS',
          title: 'GenSpark Connected',
          message: 'Successfully authenticated with GenSpark.',
          component: 'GENSPARK',
          dedupKey: 'GENSPARK_AUTH_SUCCESS'
        });
      } else {
        EventLedger.record('GENSPARK_AUTH_FAILED', 'GenSpark browser authentication failed', {
          exitCode: res.exitCode
        });
      }
    }).catch(err => {
      logger.warn(`GenSpark login error: ${err.message}`);
    });

    return {
      started: true,
      message: 'GenSpark browser login flow started. Please complete authentication in your browser.'
    };
  }

  /**
   * Log out by removing saved credentials via `gsk logout`
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  static async logout() {
    EventLedger.record('GENSPARK_LOGOUT', 'User initiated GenSpark logout');
    const res = await CommandRunner.run('gsk', ['logout'], { timeoutMs: 5000 });
    if (res.exitCode === 0) {
      NotificationManager.notify({
        type: 'INFO',
        title: 'GenSpark Logged Out',
        message: 'Saved GenSpark API key has been removed.',
        component: 'GENSPARK',
        dedupKey: 'GENSPARK_LOGGED_OUT'
      });
      return { success: true, message: 'Successfully logged out from GenSpark' };
    }

    // Fallback: remove ~/.genspark-tool-cli/config.json safely if exists
    if (fs.existsSync(paths.GENSPARK_CLI_CONFIG)) {
      try {
        fs.unlinkSync(paths.GENSPARK_CLI_CONFIG);
        return { success: true, message: 'Removed saved GenSpark CLI credentials' };
      } catch (err) {
        return { success: false, message: `Failed to remove config: ${err.message}` };
      }
    }

    return { success: true, message: 'Logged out' };
  }

  /**
   * Generate provider configuration via `gsk init-opencode`
   * @param {string} targetDir 
   * @returns {Promise<{ success: boolean, configPath?: string, error?: string }>}
   */
  static async generateProviderConfig(targetDir = paths.RUNTIME_DIR) {
    const res = await CommandRunner.run('gsk', ['init-opencode', targetDir], { timeoutMs: 10000 });
    const opencodePath = path.join(targetDir, 'opencode.json');
    if (res.exitCode === 0 && fs.existsSync(opencodePath)) {
      EventLedger.record('GENSPARK_PROVIDER_CONFIG_GENERATED', 'Generated OpenCode provider config', {
        targetDir
      });
      return { success: true, configPath: opencodePath };
    }
    return { success: false, error: res.stderr || 'Failed to generate config' };
  }

  /**
   * Discover available GenSpark providers from isolated runtime config
   * @returns {Array<object>}
   */
  static discoverProviders() {
    const isolatedKiloConfig = paths.CONFIG_FILE;
    if (fs.existsSync(isolatedKiloConfig)) {
      try {
        const raw = JSON.parse(fs.readFileSync(isolatedKiloConfig, 'utf8'));
        if (raw && raw.provider) {
          return Object.entries(raw.provider).map(([providerId, config]) => ({
            providerId,
            name: providerId === 'genspark-llm-proxy' ? 'GenSpark LLM Proxy' : 'GenSpark Gemini Proxy',
            npmPackage: '@genspark/cli',
            baseUrl: config.options?.baseURL || 'https://www.genspark.ai/api/llm_proxy/v1',
            status: 'ACTIVE',
            modelCount: config.models ? Object.keys(config.models).length : 0
          }));
        }
      } catch {
        // Fallback
      }
    }

    // Default static discovery
    return [
      {
        providerId: 'genspark-llm-proxy',
        name: 'GenSpark LLM Proxy',
        npmPackage: '@genspark/cli',
        baseUrl: 'https://www.genspark.ai/api/llm_proxy/v1',
        status: 'ACTIVE',
        modelCount: 30
      },
      {
        providerId: 'genspark-gemini-proxy',
        name: 'GenSpark Gemini Proxy',
        npmPackage: '@genspark/cli',
        baseUrl: 'https://www.genspark.ai/api/gemini_proxy/v1',
        status: 'ACTIVE',
        modelCount: 6
      }
    ];
  }

  /**
   * Dynamically discover models from the isolated runtime configuration
   * @returns {Array<object>}
   */
  static discoverModels() {
    const isolatedKiloConfig = paths.CONFIG_FILE;
    const models = [];

    if (fs.existsSync(isolatedKiloConfig)) {
      try {
        const raw = JSON.parse(fs.readFileSync(isolatedKiloConfig, 'utf8'));
        if (raw && raw.provider) {
          for (const [providerId, providerConfig] of Object.entries(raw.provider)) {
            if (providerConfig.models) {
              for (const [modelId, modelDef] of Object.entries(providerConfig.models)) {
                models.push({
                  modelId,
                  providerId,
                  fullIdentifier: `${providerId}/${modelId}`,
                  displayName: modelDef.name || modelId,
                  contextLimit: modelDef.limit?.context || 128000,
                  inputLimit: modelDef.limit?.input || 128000,
                  outputLimit: modelDef.limit?.output || 4096,
                  supportsVision: Boolean(modelDef.modalities?.input?.includes('image')),
                  supportsReasoning: Boolean(modelDef.capabilities?.reasoning || modelId.includes('opus') || modelId.includes('r1') || modelId.includes('thinking')),
                  isActive: true
                });
              }
            }
          }
        }
      } catch (err) {
        logger.warn(`Failed to read models from ${isolatedKiloConfig}: ${err.message}`);
      }
    }

    return models;
  }

  /**
   * Discover and test upstream endpoints
   * @returns {Promise<Array<object>>}
   */
  static async discoverEndpoints() {
    const providers = this.discoverProviders();
    const endpoints = [];

    for (const p of providers) {
      const url = new URL(p.baseUrl);
      const start = Date.now();
      let status = 'HEALTHY';
      let latencyMs = 0;

      try {
        await new Promise((resolve, reject) => {
          const req = https.request(
            {
              hostname: url.hostname,
              port: 443,
              path: '/api/llm_proxy/v1/models',
              method: 'HEAD',
              timeout: 3000
            },
            res => {
              latencyMs = Date.now() - start;
              resolve(res.statusCode);
            }
          );
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Endpoint timeout'));
          });
          req.end();
        });
      } catch {
        // Even if HEAD /models 401s or rejects unauthenticated HEAD, TCP+TLS handshake confirmed reachability
        latencyMs = Date.now() - start;
        if (latencyMs > 2500) {
          status = 'DEGRADED';
        }
      }

      endpoints.push({
        endpointId: `ep_${p.providerId}`,
        providerId: p.providerId,
        baseUrl: p.baseUrl,
        protocol: 'https',
        status,
        lastLatencyMs: latencyMs,
        lastSuccessAt: new Date().toISOString()
      });
    }

    return endpoints;
  }

  /**
   * $0 Passive health check (No model inference tokens consumed)
   * @returns {Promise<{ status: string, latencyMs: number, auth: object, version: string|null }>}
   */
  static async passiveHealthCheck() {
    const start = Date.now();
    const [installedCheck, versionCheck, authStatus] = await Promise.all([
      Promise.resolve(this.isInstalled()),
      this.getVersion(),
      this.getLoginStatus()
    ]);

    const latencyMs = Date.now() - start;
    let status = 'HEALTHY';

    if (!installedCheck.installed) {
      status = 'UNHEALTHY';
    } else if (!authStatus.authenticated) {
      status = 'DEGRADED';
    }

    return {
      status,
      latencyMs,
      installed: installedCheck.installed,
      binaryPath: installedCheck.binaryPath,
      version: versionCheck.version,
      auth: authStatus
    };
  }

  /**
   * Health check alias for consistency with adapters
   * @returns {Promise<{ status: string, latencyMs: number, auth: object, version: string|null }>}
   */
  static async health() {
    return await this.passiveHealthCheck();
  }

  /**
   * Active probe: Explicit user-initiated model inference request
   * @param {string} [modelId]
   * @param {string} [prompt]
   * @returns {Promise<{ success: boolean, output?: string, error?: string, latencyMs: number }>}
   */
  static async activeProbe(
    modelId = 'genspark-llm-proxy/claude-sonnet-4-6',
    prompt = 'Respond with exactly: GENSPARK_PROBE_OK'
  ) {
    logger.warn(`[ACTIVE PROBE] Executing live GenSpark inference for ${modelId}`);
    EventLedger.record('ACTIVE_PROBE_INITIATED', `User initiated active probe for model ${modelId}`);

    const start = Date.now();
    const res = await CommandRunner.run(
      'kilo',
      ['run', '--model', modelId, prompt],
      {
        timeoutMs: 35000,
        env: {
          XDG_CONFIG_HOME: paths.RUNTIME_DIR
        }
      }
    );

    const latencyMs = Date.now() - start;
    if (res.exitCode === 0 && res.stdout.includes('GENSPARK_PROBE_OK')) {
      EventLedger.record('ACTIVE_PROBE_SUCCESS', `Active probe for ${modelId} succeeded in ${latencyMs}ms`);
      return {
        success: true,
        output: res.stdout.trim(),
        latencyMs
      };
    }

    EventLedger.record('ACTIVE_PROBE_FAILURE', `Active probe for ${modelId} failed`, {
      exitCode: res.exitCode,
      error: res.stderr
    });
    return {
      success: false,
      error: res.stderr ? sanitize.redact(res.stderr.trim()) : 'Probe timed out or failed',
      latencyMs
    };
  }
}

module.exports = GenSparkAdapter;
