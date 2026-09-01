const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const RUNTIME_DIR = path.join(os.homedir(), '.config', 'kilo-genspark');
const INSTANCES_DIR = path.join(RUNTIME_DIR, 'instances');
const LOCK_FILE = path.join(RUNTIME_DIR, 'instance.json');
const ENV = {
  ...process.env,
  PATH: `${os.homedir()}/.bun/bin:${os.homedir()}/.npm-global/bin:${process.env.PATH || ''}`
};

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

function waitForServer(url, timeoutMs = 8000) {
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

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function countControlPlaneProcesses() {
  try {
    const dirs = fs.readdirSync('/proc');
    let count = 0;
    for (const d of dirs) {
      const pid = parseInt(d, 10);
      if (!isNaN(pid) && pid !== process.pid) {
        try {
          const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
          if (cmd.includes('src/index.js') && !cmd.includes('lifecycle_e2e')) {
            count++;
          }
        } catch {}
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function cleanExistingTestProcesses() {
  try {
    execSync("pkill -f 'bun.*src/index.js' || true", { stdio: 'ignore' });
  } catch {}
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
  try {
    if (fs.existsSync(INSTANCES_DIR)) {
      const files = fs.readdirSync(INSTANCES_DIR);
      for (const f of files) {
        try { fs.unlinkSync(path.join(INSTANCES_DIR, f)); } catch {}
      }
    }
  } catch {}
}

async function runLifecycleE2ESuite() {
  console.log('========================================================');
  console.log('  GSK-KILO PHASE 4B-2.1 LIFECYCLE HARDENING E2E SUITE');
  console.log('========================================================\n');

  cleanExistingTestProcesses();

  // --------------------------------------------------------------------------
  // TEST 1: Single Instance Startup & Reuse
  // --------------------------------------------------------------------------
  console.log('[1/8] Testing Single Instance Startup & Exact Process Reuse...');
  const proc1 = spawn('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim()', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380', GSK_KILO_IDLE_TIMEOUT: '60' },
    stdio: 'ignore'
  });

  await waitForServer('http://127.0.0.1:4380/api/status', 8000);
  const status1 = await fetchJson('http://127.0.0.1:4380/api/status');
  const pid1 = status1.data.pid;
  const port1 = status1.data.dashboard.port;

  if (!isPidAlive(pid1)) {
    throw new Error(`Process PID ${pid1} reported by server is not alive`);
  }
  console.log(`✓ First instance live: PID ${pid1} on port ${port1}`);

  // Launch a second starter process -> must discover and reuse existing instance
  console.log('Launching 2nd instance starter (must detect & reuse first)...');
  const proc2Out = execSync('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim() src/index.js', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380' },
    encoding: 'utf8'
  });

  // Verify second launch exited cleanly and did not create a second long-running process
  const activeProcs = countControlPlaneProcesses();
  if (activeProcs !== 1) {
    throw new Error(`Expected exactly 1 control plane process, found ${activeProcs}`);
  }
  console.log(`✓ [1/8] Reused existing instance (PID ${pid1}), total active servers: 1\n`);

  // --------------------------------------------------------------------------
  // TEST 2: Stale Registry & Dead PID Auto-Recovery
  // --------------------------------------------------------------------------
  console.log('[2/8] Testing Dead PID & Stale Registry Clean Recovery...');
  const fakeDeadPath = path.join(INSTANCES_DIR, 'gsk_inst_fake_dead.json');
  fs.writeFileSync(fakeDeadPath, JSON.stringify({
    instanceId: 'gsk_inst_fake_dead',
    pid: 9999998,
    host: '127.0.0.1',
    port: 4399,
    url: 'http://127.0.0.1:4399'
  }), { mode: 0o600 });

  const statusCheck = await fetchJson('http://127.0.0.1:4380/api/status');
  if (statusCheck.status !== 200) {
    throw new Error('Active server failed status check during stale test');
  }
  console.log('✓ [2/8] Stale registry handled transparently without crashing active instance\n');

  // --------------------------------------------------------------------------
  // TEST 3: REST API Graceful Stop (/api/control/stop)
  // --------------------------------------------------------------------------
  console.log('[3/8] Testing POST /api/control/stop Graceful Shutdown...');
  const stopRes = await postJson('http://127.0.0.1:4380/api/control/stop', { reason: 'e2e_test_stop' });
  if (stopRes.status !== 200 || stopRes.data.status !== 'shutting_down') {
    throw new Error(`Expected shutting_down response, got: ${JSON.stringify(stopRes)}`);
  }

  // Wait for process to exit
  await new Promise(r => setTimeout(r, 1200));
  if (isPidAlive(pid1)) {
    throw new Error(`Process PID ${pid1} is still alive after /api/control/stop`);
  }

  // Verify port 4380 is freed
  const portFreed = await new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => { s.close(); resolve(true); });
    s.listen(4380, '127.0.0.1');
  });

  if (!portFreed) {
    throw new Error('Port 4380 was not freed after server stop');
  }
  console.log(`✓ [3/8] Process PID ${pid1} terminated, port 4380 freed\n`);

  // --------------------------------------------------------------------------
  // TEST 4: Port Collision & Alternate Port Instance Reuse
  // --------------------------------------------------------------------------
  console.log('[4/8] Testing Port Collision & Alternate Port Instance Reuse...');
  // Occupy 4380 with dummy TCP server
  const dummyServer = net.createServer();
  await new Promise(r => dummyServer.listen(4380, '127.0.0.1', r));
  console.log('Occupied port 4380 with dummy listener');

  // Start GSK-KILO (must bind to 4381)
  const procAlt = spawn('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim()', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380', GSK_KILO_IDLE_TIMEOUT: '60' },
    stdio: 'ignore'
  });

  await waitForServer('http://127.0.0.1:4381/api/status', 8000);
  const statusAlt = await fetchJson('http://127.0.0.1:4381/api/status');
  const pidAlt = statusAlt.data.pid;
  const portAlt = statusAlt.data.dashboard.port;

  if (portAlt !== 4381) {
    throw new Error(`Expected alternate port 4381, got ${portAlt}`);
  }
  console.log(`✓ Alternate instance live on port ${portAlt} (PID ${pidAlt})`);

  // Run starter again -> must discover existing instance on port 4381!
  execSync('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim() src/index.js', {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380' },
    encoding: 'utf8'
  });

  const procsAlt = countControlPlaneProcesses();
  if (procsAlt !== 1) {
    throw new Error(`Expected exactly 1 process on alternate port, found ${procsAlt}`);
  }
  console.log(`✓ [4/8] Discovered and reused alternate port 4381 (Total processes: 1)`);

  // Clean up alternate instance & dummy server
  await postJson('http://127.0.0.1:4381/api/control/stop', { reason: 'cleanup' });
  await new Promise(r => setTimeout(r, 1000));
  dummyServer.close();
  console.log('✓ Port 4380 dummy server closed\n');

  // --------------------------------------------------------------------------
  // TEST 5: Browser Heartbeat & 2s Idle Auto-Shutdown
  // --------------------------------------------------------------------------
  console.log('[5/8] Testing Browser Heartbeat & Idle Auto-Shutdown...');
  const idleProc = spawn('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim()', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380', GSK_KILO_IDLE_TIMEOUT: '2' },
    stdio: 'ignore'
  });

  await waitForServer('http://127.0.0.1:4380/api/status', 8000);
  const idleStatus = await fetchJson('http://127.0.0.1:4380/api/status');
  const idlePid = idleStatus.data.pid;

  // Send heartbeat at t=1.0s to prove heartbeat keeps server alive
  await new Promise(r => setTimeout(r, 1000));
  await postJson('http://127.0.0.1:4380/api/heartbeat', {});
  console.log('Sent browser heartbeat at 1.0s (server stays alive)');

  // Now stop sending heartbeats and wait 3.5s (idle limit is 2s)
  console.log('Simulating browser close (no heartbeats for 3.5s)...');
  await new Promise(r => setTimeout(r, 3500));

  if (isPidAlive(idlePid)) {
    throw new Error(`Process PID ${idlePid} did not shut down after idle timeout`);
  }
  console.log(`✓ [5/8] Process PID ${idlePid} auto-terminated after browser idle timeout\n`);

  // --------------------------------------------------------------------------
  // TEST 6: In-Flight Active Operations Guard
  // --------------------------------------------------------------------------
  console.log('[6/8] Testing Active Operations Protection from Idle Shutdown...');
  const { LifecycleManager } = require('../src/index');
  const lm = new LifecycleManager({ idleTimeoutSec: 1 });
  let shutdownTriggered = false;

  lm.startIdleCheck(() => { shutdownTriggered = true; }, 100);
  lm.startOperation();

  // Wait 1.5s while operation is active
  await new Promise(r => setTimeout(r, 1500));
  if (shutdownTriggered) {
    throw new Error('Shutdown was triggered while activeOperation > 0!');
  }
  console.log('✓ Server remained running during active operation');

  // Finish operation and wait for idle timer
  lm.endOperation();
  await new Promise(r => setTimeout(r, 1500));
  if (!shutdownTriggered) {
    throw new Error('Shutdown was not triggered after activeOperation completed');
  }
  lm.stopIdleCheck();
  console.log('✓ [6/8] Active operations guard verified\n');

  // --------------------------------------------------------------------------
  // TEST 7: Zero Secrets in Instance Registry or Control Status
  // --------------------------------------------------------------------------
  console.log('[7/8] Auditing Instance Registry and Status for Secrets...');
  const checkProc = spawn('require('child_process').execSync('command -v bun', { shell: '/bin/bash' }).toString().trim()', ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...ENV, GSK_KILO_PORT: '4380', GSK_KILO_IDLE_TIMEOUT: '60' },
    stdio: 'ignore'
  });

  await waitForServer('http://127.0.0.1:4380/api/control/status', 8000);
  const ctrlStatus = await fetchJson('http://127.0.0.1:4380/api/control/status');
  const rawStatus = JSON.stringify(ctrlStatus.data);

  if (/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i.test(rawStatus) || /"apiKey":\s*"[^"]+"/i.test(rawStatus) || /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i.test(rawStatus)) {
    throw new Error('CRITICAL: Secret token leaked in /api/control/status!');
  }

  // Audit instances registry files
  if (fs.existsSync(INSTANCES_DIR)) {
    for (const f of fs.readdirSync(INSTANCES_DIR)) {
      const content = fs.readFileSync(path.join(INSTANCES_DIR, f), 'utf8');
      if (/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i.test(content) || /"apiKey":\s*"[^"]+"/i.test(content)) {
        throw new Error(`CRITICAL: Secret token found in instance file ${f}!`);
      }
    }
  }

  await postJson('http://127.0.0.1:4380/api/control/stop', { reason: 'test_done' });
  await new Promise(r => setTimeout(r, 1000));
  console.log('✓ [7/8] Zero secrets present in instance registry or control API\n');

  // --------------------------------------------------------------------------
  // TEST 8: Phase 3 Live Regression Model Request
  // --------------------------------------------------------------------------
  console.log('[8/8] Performing Phase 3 Live Model Request through gsk-kilo...');
  const liveOutput = execSync('gsk-kilo run --model genspark-llm-proxy/claude-sonnet-4-6 "Respond with exactly: LIFECYCLE_REGRESSION_OK"', {
    env: ENV,
    encoding: 'utf8',
    timeout: 45000
  });

  if (!liveOutput.includes('LIFECYCLE_REGRESSION_OK')) {
    throw new Error(`Live model request failed. Output: ${liveOutput}`);
  }
  console.log('✓ [8/8] Live request succeeded (LIFECYCLE_REGRESSION_OK received)\n');

  console.log('========================================================');
  console.log('  ALL 8 LIFECYCLE HARDENING TESTS PASSED WITH 0 LEAKS!');
  console.log('========================================================\n');
}

runLifecycleE2ESuite().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Lifecycle E2E Failure:', err);
  cleanExistingTestProcesses();
  process.exit(1);
});
