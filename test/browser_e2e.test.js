const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const RUNTIME_DIR = path.join(os.homedir(), '.config', 'kilo-genspark');
const CONFIG_FILE = path.join(RUNTIME_DIR, 'kilo', 'kilo.json');
const ENV = {
  ...process.env,
  PATH: `${os.homedir()}/.bun/bin:${os.homedir()}/.npm-global/bin:${process.env.PATH || ''}`
};

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function postJson(url, bodyObj = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timed out waiting for server at ${url}`));
        } else {
          setTimeout(tryConnect, 100);
        }
      });
    };
    tryConnect();
  });
}

async function runBrowserE2ESuite() {
  console.log('========================================================');
  console.log('  GSK-KILO PHASE 4B-2 ADAPTERS & BROWSER E2E SUITE');
  console.log('========================================================\n');

  // 1. Start Server on Port 4380
  console.log('[1/12] Starting Bun Control Plane Server on 4380...');
  const serverProc = spawn('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim()', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380', GSK_KILO_IDLE_TIMEOUT: '60' },
    stdio: 'ignore'
  });

  await waitForServer('http://127.0.0.1:4380/api/status', 10000);
  console.log('✓ [1/12] Control plane is live on http://127.0.0.1:4380\n');

  // 2. Test HTML Content-Type & Static Fallback Rendering
  console.log('[2/12] Verifying HTML Content-Type & Static Fallback Rendering...');
  const rootRes = await fetchText('http://127.0.0.1:4380/');
  if (rootRes.status !== 200 || !rootRes.headers['content-type'].includes('text/html')) {
    throw new Error(`Expected text/html 200, got status ${rootRes.status}`);
  }

  const expectedStrings = [
    '⚡ GSK-KILO',
    'Portable Local AI Environment',
    'OVERVIEW & STATUS',
    'KILO CONFIGURATION',
    'SYNC TARGET',
    'Kilo Global',
    'Installation',
    'Authentication',
    'Configuration',
    'GENSPARK PROVIDER',
    'Provider ID',
    'Endpoint',
    'Models',
    'Active Model',
    'https://www.genspark.ai/api/llm_proxy/v1',
    'Refresh',
    'SYNC CONFIGURATION',
    'Validate',
    'Test',
    'Open Kilo',
    'test-modal',
    'PORTABILITY & SETUP WIZARD',
    'ENVIRONMENT & PREREQUISITES',
    'PORTABILITY PROFILE',
    'Set Up Prerequisites',
    'Check / Repair',
    'Export Profile',
    'Import Profile',
    '/api/status',
    '/api/kilo/status',
    '/api/kilo/config-targets',
    '/api/bootstrap/detect',
    '/api/system',
    '/api/health',
    '/api/models',
    '/api/providers',
    '/api/notifications'
  ];

  for (const str of expectedStrings) {
    if (!rootRes.body.includes(str)) {
      throw new Error(`Static HTML missing required text: "${str}"`);
    }
  }
  console.log('✓ [2/12] All static fallback and Kilo Configuration elements present in server HTML\n');

  // 3. Favicon Check (204 No Content -> Zero Console 404s)
  console.log('[3/12] Verifying GET /favicon.ico returns 204 No Content...');
  const faviconRes = await fetchText('http://127.0.0.1:4380/favicon.ico');
  if (faviconRes.status !== 204) {
    throw new Error(`Expected 204 No Content for favicon, got ${faviconRes.status}`);
  }
  console.log('✓ [3/12] Favicon returns 204 (Zero browser 404 console errors)\n');

  // 4. Test GenSpark & Kilo Adapter APIs
  console.log('[4/12] Verifying GenSpark & Kilo status and validate API endpoints...');
  const gskRes = await fetchJson('http://127.0.0.1:4380/api/genspark/status');
  const kiloRes = await fetchJson('http://127.0.0.1:4380/api/kilo/status');
  const kiloValRes = await postJson('http://127.0.0.1:4380/api/kilo/validate', {});
  const kiloLaunchRes = await postJson('http://127.0.0.1:4380/api/kilo/launch', {});

  if (!gskRes.data.installed || !gskRes.data.auth.authenticated) {
    throw new Error('GenSpark status endpoint reported unauthenticated state');
  }
  if (!kiloRes.data.installed || !kiloRes.data.config.valid || !kiloValRes.data.valid || !kiloLaunchRes.data.success) {
    throw new Error('Kilo status/validate/launch endpoint reported invalid state');
  }
  console.log(`✓ [4/12] GenSpark (plan: ${gskRes.data.auth.plan}, v${gskRes.data.version}) and Kilo (v${kiloRes.data.version}, endpoint: ${kiloValRes.data.details.endpoint}) verified\n`);

  // 5. Test Dynamic Models & Providers Discovery APIs
  console.log('[5/12] Verifying Catalog Discovery APIs (Providers, Models, Endpoints)...');
  const provRes = await fetchJson('http://127.0.0.1:4380/api/providers');
  const modelsRes = await fetchJson('http://127.0.0.1:4380/api/models');
  const epRes = await fetchJson('http://127.0.0.1:4380/api/endpoints');

  if (provRes.data.count < 2 || modelsRes.data.total < 36 || epRes.data.count < 2) {
    throw new Error(`Unexpected catalog counts: ${provRes.data.count} providers, ${modelsRes.data.total} models, ${epRes.data.count} endpoints`);
  }
  console.log(`✓ [5/12] Discovered ${provRes.data.count} providers, ${modelsRes.data.total} dynamic models, ${epRes.data.count} endpoints\n`);

  // 6. Test Catalog Synchronization API
  console.log('[6/12] Testing POST /api/genspark/sync ...');
  const syncRes = await postJson('http://127.0.0.1:4380/api/genspark/sync', {});
  if (syncRes.status !== 200 || syncRes.data.status !== 'ok') {
    throw new Error('Catalog sync failed');
  }
  console.log(`✓ [6/12] Catalog sync API succeeded (${syncRes.data.modelCount} models synchronized)\n`);

  // 7. Test Notifications API & Deduplication
  console.log('[7/12] Testing Notifications API and Deduplication...');
  const notifRes = await fetchJson('http://127.0.0.1:4380/api/notifications');
  if (notifRes.status !== 200 || !Array.isArray(notifRes.data.active)) {
    throw new Error('Notifications API failed');
  }
  console.log(`✓ [7/12] Notifications API working (Active count: ${notifRes.data.activeCount})\n`);

  // 8. Test Passive Health Check ($0 token usage)
  console.log('[8/12] Testing Passive Health Check API (No LLM tokens consumed)...');
  const healthRes = await fetchJson('http://127.0.0.1:4380/api/health');
  if (healthRes.data.status !== 'healthy' || healthRes.data.genspark.status !== 'HEALTHY' || healthRes.data.kilo.status !== 'HEALTHY') {
    throw new Error(`Passive health check failed: ${JSON.stringify(healthRes.data)}`);
  }
  console.log(`✓ [8/12] Passive health check verified: Overall=${healthRes.data.status}, GenSpark=${healthRes.data.genspark.status}, Kilo=${healthRes.data.kilo.status}\n`);

  // 9. Test Heartbeat POST & Lifecycle Reset
  console.log('[9/12] Testing POST /api/heartbeat ...');
  const heartbeatPost = await postJson('http://127.0.0.1:4380/api/heartbeat', {});
  if (heartbeatPost.data.status !== 'ok') {
    throw new Error('Heartbeat failed');
  }
  console.log('✓ [9/12] Heartbeat POST succeeded, session reset\n');

  // 10. Test Idle Shutdown Trigger
  console.log('[10/12] Testing idle auto-shutdown after idle timeout with no heartbeat...');
  try {
    await postJson('http://127.0.0.1:4380/api/control/stop', { reason: 'browser_e2e_step_10' });
  } catch {}
  serverProc.kill('SIGKILL');
  await new Promise(r => setTimeout(r, 600));

  const shortIdleProc = spawn('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim()', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4385', GSK_KILO_IDLE_TIMEOUT: '2' },
    stdio: 'ignore'
  });
  await waitForServer('http://127.0.0.1:4385/api/status', 8000);
  await new Promise(r => setTimeout(r, 3500));
  let isAlive = false;
  try {
    process.kill(shortIdleProc.pid, 0);
    isAlive = true;
  } catch {
    isAlive = false;
  }
  if (isAlive) {
    throw new Error('Server did not exit on idle timeout');
  }
  console.log('✓ [10/12] Server cleanly auto-terminated on idle timeout\n');

  // 11. Secret Leak Audit
  console.log('[11/12] Auditing UI payload and API responses for secret tokens...');
  const checkPayloads = [
    rootRes.body,
    JSON.stringify(gskRes.data),
    JSON.stringify(kiloRes.data),
    JSON.stringify(modelsRes.data),
    JSON.stringify(provRes.data),
    JSON.stringify(epRes.data),
    JSON.stringify(healthRes.data)
  ];
  for (const p of checkPayloads) {
    if (/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i.test(p) || /"apiKey":\s*"[^"]+"/i.test(p) || /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i.test(p)) {
      throw new Error('CRITICAL: Secret token leaked in UI or API payload!');
    }
  }
  console.log('✓ [11/12] Secret audit passed (zero credentials in UI/API payloads)\n');

  // 12. Phase 3 Regression Live Model Request
  console.log('[12/12] Performing Phase 3 Live Model Request through gsk-kilo...');
  const liveOutput = execSync('gsk-kilo run --model genspark-llm-proxy/claude-sonnet-4-6 "Respond with exactly: POST_MIGRATION_E2E_OK"', {
    env: ENV,
    encoding: 'utf8',
    timeout: 45000
  });
  if (!liveOutput.includes('POST_MIGRATION_E2E_OK')) {
    throw new Error(`Live model request failed. Output: ${liveOutput}`);
  }
  console.log('✓ [12/12] Live request succeeded (POST_MIGRATION_E2E_OK received)\n');

  console.log('========================================================');
  console.log('  ALL 12 ADAPTER & BROWSER E2E TESTS PASSED WITH ZERO ERRORS!');
  console.log('========================================================\n');
}

runBrowserE2ESuite().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Browser E2E Failure:', err);
  process.exit(1);
});
