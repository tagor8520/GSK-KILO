const { version } = require('../../../package.json');
const { HOST } = require('../../config/paths');

async function rootRoutes(fastify, options) {
  const currentPort = options.port || 4380;
  const currentHost = options.host || HOST;
  const currentInstanceId = options.instanceId || 'unknown';
  const lifecycleManager = options.lifecycleManager;

  // Handle favicon.ico cleanly with 204 No Content
  fastify.get('/favicon.ico', async (request, reply) => {
    reply.code(204).send();
  });

  fastify.get('/', async (request, reply) => {
    const bunVersion = typeof Bun !== 'undefined' ? Bun.version : '1.4.0';
    const nodeVersion = process.version;
    const idleTimeout = lifecycleManager ? lifecycleManager.idleTimeoutSec : 60;
    const idleDisplay = idleTimeout > 0 ? `${idleTimeout} seconds` : 'Disabled';

    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GSK-KILO Control Plane</title>
  <style>
    :root {
      --bg-canvas: #090d13;
      --bg-surface: #101620;
      --bg-card: #16202c;
      --bg-card-hover: #1c2938;
      --border-subtle: #243242;
      --border-active: #388bfd;
      --text-primary: #f0f6fc;
      --text-secondary: #8b949e;
      --text-muted: #6e7681;
      --color-green: #3fb950;
      --color-orange: #f0883e;
      --color-blue: #58a6ff;
      --color-purple: #bc8cff;
      --color-red: #f85149;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-canvas);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 1.5rem;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
    }

    .container {
      width: 100%;
      max-width: 820px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.65);
      margin: auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 1.25rem;
      margin-bottom: 1.5rem;
    }

    .brand-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .brand-subtitle {
      font-size: 0.88rem;
      color: var(--text-secondary);
      margin-top: 0.2rem;
    }

    .badge-local {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--color-green);
      background: rgba(63, 185, 80, 0.12);
      border: 1px solid rgba(63, 185, 80, 0.35);
      border-radius: 999px;
      padding: 0.25rem 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      display: inline-block;
    }

    .pulse {
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.2); }
    }

    .section-title {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-secondary);
      margin: 1.5rem 0 0.75rem 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .grid-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      gap: 0.85rem;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
      transition: border-color 0.2s, background-color 0.2s;
    }

    .card:hover {
      background: var(--bg-card-hover);
      border-color: rgba(88, 166, 255, 0.4);
    }

    .card-label {
      font-size: 0.72rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-secondary);
      margin-bottom: 0.35rem;
    }

    .card-value {
      font-size: 0.98rem;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }

    .status-healthy { color: var(--color-green); }
    .status-warning { color: var(--color-orange); }
    .status-error { color: var(--color-red); }
    .status-info { color: var(--color-blue); }

    .notification-banner {
      background: rgba(240, 136, 62, 0.1);
      border: 1px solid rgba(240, 136, 62, 0.3);
      border-radius: 8px;
      padding: 0.85rem 1rem;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .notification-content {
      font-size: 0.88rem;
    }

    .notification-title {
      font-weight: 600;
      color: var(--color-orange);
    }

    .runtime-box {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 1rem;
      margin-top: 0.75rem;
    }

    .runtime-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.45rem 0;
      font-size: 0.88rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }

    .runtime-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .runtime-key {
      color: var(--text-secondary);
    }

    .runtime-val {
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      color: var(--text-primary);
    }

    .actions-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1.5rem;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border-subtle);
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .btn {
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
      border-radius: 6px;
      padding: 0.45rem 0.95rem;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.15s ease;
    }

    .btn:hover {
      background: var(--bg-card-hover);
      border-color: var(--color-blue);
      color: var(--color-blue);
    }

    .btn:focus-visible {
      outline: 2px solid var(--color-blue);
      outline-offset: 2px;
    }

    .btn:active {
      transform: scale(0.98);
    }

    .btn-primary {
      background: #238636;
      border-color: rgba(255, 255, 255, 0.1);
      color: #fff;
    }

    .btn-primary:hover {
      background: #2ea043;
      border-color: #2ea043;
      color: #fff;
    }

    .btn-warning {
      background: rgba(240, 136, 62, 0.15);
      border-color: rgba(240, 136, 62, 0.4);
      color: var(--color-orange);
    }

    .btn-danger {
      background: rgba(248, 81, 73, 0.15);
      border-color: rgba(248, 81, 73, 0.4);
      color: var(--color-red);
    }

    .btn-danger:hover {
      background: rgba(248, 81, 73, 0.25);
      border-color: var(--color-red);
      color: #ff7b72;
    }

    .api-links {
      font-size: 0.8rem;
      color: var(--text-muted);
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .api-links a {
      color: var(--color-blue);
      text-decoration: none;
    }

    .api-links a:hover {
      text-decoration: underline;
    }

    .last-updated {
      font-size: 0.75rem;
      color: var(--text-muted);
    }

    @media (max-width: 640px) {
      .container { padding: 1.25rem; }
      .grid-cards { grid-template-columns: 1fr; }
      .actions-bar { flex-direction: column; align-items: stretch; }
    }
  </style>
</head>
<body>
  <main class="container" id="app-container">
    <header>
      <div>
        <h1 class="brand-title" id="main-heading">
          <span>⚡ GSK-KILO</span>
        </h1>
        <p class="brand-subtitle">Portable Local AI Environment</p>
      </div>
      <div class="badge-local">
        <span class="dot pulse"></span>
        <span>LOCAL</span>
      </div>
    </header>

    <!-- NOTIFICATIONS FEED -->
    <div id="notifications-container"></div>

    <!-- OVERVIEW & AUTHENTICATION -->
    <section aria-labelledby="sec-auth">
      <h2 class="section-title" id="sec-auth">OVERVIEW & STATUS</h2>
      <div class="grid-cards">
        <div class="card" id="card-gsk-auth">
          <div class="card-label">GenSpark</div>
          <div class="card-value status-healthy" id="val-gsk-auth">
            <span class="dot"></span> Connected
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.35rem;" id="val-gsk-plan">
            Plan: Plus
          </div>
        </div>

        <div class="card" id="card-kilo-auth">
          <div class="card-label">Kilo Code</div>
          <div class="card-value status-healthy" id="val-kilo-auth">
            <span class="dot"></span> Ready
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.35rem;" id="val-kilo-creds">
            Runtime: Isolated (OK)
          </div>
        </div>

        <div class="card" id="card-providers">
          <div class="card-label">Provider</div>
          <div class="card-value" id="val-providers" style="font-size:1.05rem;">
            genspark-llm-proxy
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.35rem;">
            Direct Upstream (Zero Proxy)
          </div>
        </div>

        <div class="card" id="card-models">
          <div class="card-label">Models</div>
          <div class="card-value" id="val-models">
            36 Available
          </div>
          <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.35rem;">
            Dynamic Catalog
          </div>
        </div>
      </div>
    </section>

    <!-- KILO CONFIGURATION CENTER -->
    <section aria-labelledby="sec-kilo-cfg" id="section-kilo-config">
      <h2 class="section-title" id="sec-kilo-cfg">KILO CONFIGURATION</h2>
      <div class="runtime-box" id="kilo-config-box">
        
        <!-- TARGET SELECTOR -->
        <div style="margin-bottom: 0.9rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--border-subtle);">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.45rem;">
            SYNC TARGET
          </div>
          <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
            <select id="kilo-target-select" style="background:rgba(255,255,255,0.06); border:1px solid var(--border-subtle); color:var(--text-primary); padding:0.45rem 0.75rem; border-radius:6px; font-size:0.85rem; font-family:inherit; min-width:260px; cursor:pointer;">
              <option value="global" selected>Kilo Global (~/.config/kilo/kilo.jsonc)</option>
              <option value="isolated">GSK-KILO Isolated (~/.config/kilo-genspark/kilo/kilo.json)</option>
              <option value="project">Current Project (./kilo.jsonc)</option>
            </select>
            <span id="val-kilo-used-by" style="font-size:0.75rem; background:rgba(59,130,246,0.15); color:var(--color-blue); padding:0.25rem 0.5rem; border-radius:4px;">
              Used by: ✓ Kilo CLI  ✓ VS Code Kilo Code
            </span>
          </div>
        </div>

        <!-- ACTIVE CONFIGURATION DISPLAY -->
        <div class="runtime-row">
          <span class="runtime-key">Active Target File</span>
          <span class="runtime-val" id="val-kilo-target-path" style="font-family:monospace; font-size:0.8rem;">~/.config/kilo/kilo.jsonc</span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Installation</span>
          <span class="runtime-val status-healthy" id="val-kilo-install">
            <span class="dot"></span> Detected 7.2.0
          </span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Authentication</span>
          <span class="runtime-val status-healthy" id="val-kilo-auth-state">
            <span class="dot"></span> Authenticated
          </span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Configuration</span>
          <span class="runtime-val status-healthy" id="val-kilo-validity">
            <span class="dot"></span> Valid
          </span>
        </div>

        <div style="border-top: 1px solid var(--border-subtle); margin: 0.85rem 0; padding-top: 0.85rem;">
          <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.6rem;">
            GENSPARK PROVIDER
          </div>
          <div class="runtime-row">
            <span class="runtime-key">Provider ID</span>
            <span class="runtime-val" id="val-kilo-provider-id">genspark-llm-proxy</span>
          </div>
          <div class="runtime-row">
            <span class="runtime-key">Endpoint</span>
            <span class="runtime-val" id="val-kilo-endpoint">https://www.genspark.ai/api/llm_proxy/v1</span>
          </div>
          <div class="runtime-row">
            <span class="runtime-key">Models</span>
            <span class="runtime-val" id="val-kilo-model-count">36 available</span>
          </div>
          <div class="runtime-row">
            <span class="runtime-key">Active Model</span>
            <span class="runtime-val" id="val-kilo-active-model" style="color:var(--color-blue); font-weight:600;">claude-sonnet-4-6</span>
          </div>
        </div>

        <div style="margin-top: 1.1rem; display: flex; gap: 0.65rem; flex-wrap: wrap; align-items: center;">
          <button class="btn btn-primary" id="kilo-sync-btn" type="button" aria-label="Sync Configuration">
            <span aria-hidden="true">🔄</span> SYNC CONFIGURATION
          </button>
          <button class="btn" id="kilo-validate-btn" type="button" aria-label="Validate Kilo Configuration">
            <span aria-hidden="true">🔍</span> Validate
          </button>
          <button class="btn btn-warning" id="kilo-test-btn" type="button" aria-label="Test Kilo Connection">
            <span aria-hidden="true">🧪</span> Test
          </button>
          <button class="btn" id="kilo-open-btn" type="button" aria-label="Open Kilo">
            <span aria-hidden="true">🚀</span> Open Kilo
          </button>
          <span id="kilo-action-status" style="font-size:0.8rem; color:var(--text-secondary); margin-left:0.35rem;"></span>
        </div>
      </div>
    </section>

    <!-- SYSTEM & RUNTIME SECTION -->
    <section aria-labelledby="sec-system">
      <h2 class="section-title" id="sec-system">SYSTEM & RUNTIME</h2>
      <div class="grid-cards">
        <div class="card" id="card-control">
          <div class="card-label">Control Plane</div>
          <div class="card-value status-healthy" id="val-control">
            <span class="dot"></span> Healthy
          </div>
        </div>

        <div class="card" id="card-db">
          <div class="card-label">Database</div>
          <div class="card-value status-healthy" id="val-db">
            <span class="dot"></span> Healthy
          </div>
        </div>

        <div class="card" id="card-bun">
          <div class="card-label">Bun Runtime</div>
          <div class="card-value" id="val-bun">
            ${bunVersion}
          </div>
        </div>

        <div class="card" id="card-node">
          <div class="card-label">Node Host</div>
          <div class="card-value" id="val-node">
            ${nodeVersion}
          </div>
        </div>
      </div>
    </section>

    <!-- DASHBOARD RUNTIME -->
    <section aria-labelledby="sec-runtime">
      <h2 class="section-title" id="sec-runtime">DASHBOARD RUNTIME</h2>
      <div class="runtime-box">
        <div class="runtime-row">
          <span class="runtime-key">Server</span>
          <span class="runtime-val" id="val-server">${currentHost}:${currentPort}</span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Upstream Provider URL</span>
          <span class="runtime-val" id="val-upstream">https://www.genspark.ai/api/llm_proxy/v1</span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Lifecycle</span>
          <span class="runtime-val" id="val-lifecycle">Auto-close: ${idleDisplay}</span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Heartbeat</span>
          <span class="runtime-val status-healthy" id="val-heartbeat">
            <span class="dot pulse"></span> Connected
          </span>
        </div>
      </div>
    </section>

    <!-- PORTABILITY, SETUP WIZARD & REPAIR SECTION -->
    <section aria-labelledby="sec-portability" id="section-portability">
      <h2 class="section-title" id="sec-portability">PORTABILITY & SETUP WIZARD</h2>
      
      <!-- SETUP WIZARD STATUS CARD -->
      <div class="runtime-box" id="setup-wizard-box" style="margin-bottom: 1rem;">
        <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary); margin-bottom:0.6rem; display:flex; justify-content:space-between; align-items:center;">
          <span>ENVIRONMENT & PREREQUISITES</span>
          <span class="status-healthy" id="val-bootstrap-status" style="font-size:0.75rem;">
            <span class="dot"></span> READY
          </span>
        </div>
        <div class="grid-cards" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.5rem; margin-bottom: 0.75rem;">
          <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px;" id="chk-os">✓ Linux OS</div>
          <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px;" id="chk-internet">✓ Internet</div>
          <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px;" id="chk-bun">✓ Bun Runtime</div>
          <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px;" id="chk-node">✓ Node.js</div>
          <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px;" id="chk-gsk">✓ GenSpark CLI</div>
          <div style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.4rem 0.6rem; border-radius:4px;" id="chk-kilo">✓ Kilo Code</div>
        </div>

        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary" id="setup-btn" type="button" aria-label="Run Prerequisite Setup">
            <span aria-hidden="true">🚀</span> Set Up Prerequisites
          </button>
          <button class="btn" id="repair-btn" type="button" aria-label="Check and Repair Environment">
            <span aria-hidden="true">🔧</span> Check / Repair
          </button>
          <span id="bootstrap-action-status" style="font-size:0.8rem; color:var(--text-secondary); margin-left:0.35rem;"></span>
        </div>
      </div>

      <!-- PORTABILITY PROFILE CARD -->
      <div class="runtime-box" id="profile-box">
        <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary); margin-bottom:0.4rem;">
          PORTABILITY PROFILE (ZERO SECRETS)
        </div>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.85rem;">
          Export or import machine-independent UI and provider preferences. Tokens, keys, and credentials are never exported.
        </p>
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
          <button class="btn" id="export-profile-btn" type="button" aria-label="Export Profile">
            <span aria-hidden="true">💾</span> Export Profile
          </button>
          <label class="btn" style="margin-bottom:0; cursor:pointer;" id="import-profile-label">
            <span aria-hidden="true">📂</span> Import Profile
            <input type="file" id="import-file-input" accept=".json" style="display:none;" />
          </label>
          <span id="profile-action-status" style="font-size:0.8rem; color:var(--text-secondary); margin-left:0.35rem;"></span>
        </div>
      </div>
    </section>

    <!-- CONTROL & LIFECYCLE SECTION -->
    <section aria-labelledby="sec-control">
      <h2 class="section-title" id="sec-control">CONTROL & LIFECYCLE</h2>
      <div class="runtime-box" id="control-box">
        <div class="runtime-row">
          <span class="runtime-key">Server Status</span>
          <span class="runtime-val status-healthy" id="val-server-status">
            <span class="dot"></span> Running
          </span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Process PID</span>
          <span class="runtime-val" id="val-server-pid">${process.pid}</span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Port</span>
          <span class="runtime-val" id="val-server-port">${currentPort}</span>
        </div>
        <div class="runtime-row">
          <span class="runtime-key">Instance ID</span>
          <span class="runtime-val" id="val-instance-id" style="font-size:0.75rem;">${currentInstanceId}</span>
        </div>
        <div style="margin-top: 1rem; display: flex; gap: 0.75rem; flex-wrap: wrap;">
          <button class="btn btn-danger" id="stop-server-btn" type="button" aria-label="Stop Server">
            <span aria-hidden="true">🛑</span> Stop Server
          </button>
          <button class="btn btn-danger" id="exit-server-btn" type="button" aria-label="Exit GSK-KILO">
            <span aria-hidden="true">🚪</span> Exit GSK-KILO
          </button>
        </div>
      </div>
    </section>

    <!-- MODAL: EXPLICIT TEST CONFIRMATION -->
    <div id="test-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:9999; align-items:center; justify-content:center;">
      <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:8px; padding:1.5rem; max-width:440px; width:90%; box-shadow:0 12px 32px rgba(0,0,0,0.6);">
        <h3 style="font-size:1.1rem; margin-bottom:0.75rem; color:var(--color-yellow); display:flex; align-items:center; gap:0.5rem;">
          <span>⚠️</span> Test GenSpark Connection
        </h3>
        <p style="font-size:0.9rem; color:var(--text-primary); margin-bottom:0.4rem;">
          This performs a real GenSpark model request.
        </p>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:1.25rem;">
          Model: <code>genspark-llm-proxy/claude-sonnet-4-6</code><br/>
          Usage/credits may apply.
        </p>
        <div style="display:flex; justify-content:flex-end; gap:0.75rem;">
          <button class="btn" id="modal-cancel-btn" type="button">Cancel</button>
          <button class="btn btn-warning" id="modal-test-btn" type="button">Test</button>
        </div>
      </div>
    </div>

    <!-- ACTIONS & API LINKS -->
    <footer class="actions-bar">
      <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap;">
        <button class="btn btn-primary" id="refresh-btn" type="button" aria-label="Refresh Dashboard">
          <span aria-hidden="true">↻</span> Refresh
        </button>
        <button class="btn" id="sync-btn" type="button" aria-label="Sync Catalog">
          <span aria-hidden="true">⚡</span> Sync Catalog
        </button>
        <span class="last-updated" id="val-updated" style="margin-left: 0.5rem;">Just now</span>
      </div>

      <nav class="api-links" aria-label="API Endpoints">
        <a href="/api/status" id="link-status">/api/status</a>
        <a href="/api/kilo/status" id="link-kilo-status">/api/kilo/status</a>
        <a href="/api/kilo/config-targets" id="link-kilo-targets">/api/kilo/config-targets</a>
        <a href="/api/bootstrap/detect" id="link-bootstrap-detect">/api/bootstrap/detect</a>
        <a href="/api/system" id="link-system">/api/system</a>
        <a href="/api/health" id="link-health">/api/health</a>
        <a href="/api/models" id="link-models">/api/models</a>
        <a href="/api/providers" id="link-providers">/api/providers</a>
        <a href="/api/notifications" id="link-notifs">/api/notifications</a>
        <a href="/api/control/status" id="link-control">/api/control/status</a>
      </nav>
    </footer>
  </main>

  <script>
    // Progressive Enhancement & Heartbeat Controller
    (function () {
      const refreshBtn = document.getElementById('refresh-btn');
      const syncBtn = document.getElementById('sync-btn');
      const stopServerBtn = document.getElementById('stop-server-btn');
      const exitServerBtn = document.getElementById('exit-server-btn');
      const updatedEl = document.getElementById('val-updated');
      const notifsEl = document.getElementById('notifications-container');

      const valControl = document.getElementById('val-control');
      const valDb = document.getElementById('val-db');
      const valBun = document.getElementById('val-bun');
      const valNode = document.getElementById('val-node');
      const valGskAuth = document.getElementById('val-gsk-auth');
      const valGskPlan = document.getElementById('val-gsk-plan');
      const valKiloAuth = document.getElementById('val-kilo-auth');
      const valKiloCreds = document.getElementById('val-kilo-creds');
      const valProviders = document.getElementById('val-providers');
      const valModels = document.getElementById('val-models');
      const valServer = document.getElementById('val-server');
      const valHeartbeat = document.getElementById('val-heartbeat');

      // Kilo Configuration Center elements
      const kiloTargetSelect = document.getElementById('kilo-target-select');
      const valKiloTargetPath = document.getElementById('val-kilo-target-path');
      const valKiloUsedBy = document.getElementById('val-kilo-used-by');
      const kiloSyncBtn = document.getElementById('kilo-sync-btn');
      const kiloValidateBtn = document.getElementById('kilo-validate-btn');
      const kiloTestBtn = document.getElementById('kilo-test-btn');
      const kiloOpenBtn = document.getElementById('kilo-open-btn');
      const kiloActionStatus = document.getElementById('kilo-action-status');

      const valKiloInstall = document.getElementById('val-kilo-install');
      const valKiloAuthState = document.getElementById('val-kilo-auth-state');
      const valKiloValidity = document.getElementById('val-kilo-validity');
      const valKiloProviderId = document.getElementById('val-kilo-provider-id');
      const valKiloEndpoint = document.getElementById('val-kilo-endpoint');
      const valKiloModelCount = document.getElementById('val-kilo-model-count');
      const valKiloActiveModel = document.getElementById('val-kilo-active-model');

      // Bootstrap & Portability elements
      const valBootstrapStatus = document.getElementById('val-bootstrap-status');
      const chkOs = document.getElementById('chk-os');
      const chkInternet = document.getElementById('chk-internet');
      const chkBun = document.getElementById('chk-bun');
      const chkNode = document.getElementById('chk-node');
      const chkGsk = document.getElementById('chk-gsk');
      const chkKilo = document.getElementById('chk-kilo');
      const setupBtn = document.getElementById('setup-btn');
      const repairBtn = document.getElementById('repair-btn');
      const bootstrapActionStatus = document.getElementById('bootstrap-action-status');

      const exportProfileBtn = document.getElementById('export-profile-btn');
      const importFileInput = document.getElementById('import-file-input');
      const profileActionStatus = document.getElementById('profile-action-status');

      // Modal elements
      const testModal = document.getElementById('test-modal');
      const modalCancelBtn = document.getElementById('modal-cancel-btn');
      const modalTestBtn = document.getElementById('modal-test-btn');

      let heartbeatTimer = null;

      function getSelectedKiloTarget() {
        return kiloTargetSelect ? kiloTargetSelect.value : 'global';
      }

      async function refreshData() {
        if (refreshBtn) refreshBtn.disabled = true;
        const currentTarget = getSelectedKiloTarget();

        try {
          const [healthRes, systemRes, statusRes, gskRes, kiloRes, catalogRes, notifsRes, bootRes] = await Promise.allSettled([
            fetch('/api/health').then(r => r.json()),
            fetch('/api/system').then(r => r.json()),
            fetch('/api/status').then(r => r.json()),
            fetch('/api/genspark/status').then(r => r.json()),
            fetch('/api/kilo/status?target=' + encodeURIComponent(currentTarget)).then(r => r.json()),
            fetch('/api/models?limit=1').then(r => r.json()),
            fetch('/api/notifications').then(r => r.json()),
            fetch('/api/bootstrap/detect').then(r => r.json())
          ]);

          // Update Health & DB
          if (healthRes.status === 'fulfilled' && healthRes.value) {
            const h = healthRes.value;
            valControl.innerHTML = '<span class="dot"></span> ' + (h.status === 'healthy' ? 'Healthy' : 'Degraded');
            valControl.className = 'card-value ' + (h.status === 'healthy' ? 'status-healthy' : 'status-warning');

            valDb.innerHTML = '<span class="dot"></span> ' + (h.database === 'ok' ? 'Healthy' : 'Error');
            valDb.className = 'card-value ' + (h.database === 'ok' ? 'status-healthy' : 'status-error');
          }

          // Update GenSpark Auth
          if (gskRes.status === 'fulfilled' && gskRes.value) {
            const g = gskRes.value;
            if (g.auth && g.auth.authenticated) {
              valGskAuth.innerHTML = '<span class="dot"></span> Connected';
              valGskAuth.className = 'card-value status-healthy';
              valGskPlan.textContent = 'Plan: ' + (g.auth.plan ? g.auth.plan.toUpperCase() : 'PLUS') + (g.auth.creditBalance ? ' (' + g.auth.creditBalance.toFixed(1) + ' credits)' : '');
            } else {
              valGskAuth.innerHTML = '<span class="dot"></span> Not Logged In';
              valGskAuth.className = 'card-value status-warning';
              valGskPlan.textContent = 'Login required';
            }
          }

          // Update Kilo Overview & Configuration Center
          if (kiloRes.status === 'fulfilled' && kiloRes.value) {
            const k = kiloRes.value;
            const isConfigValid = k.config && k.config.valid;
            
            // Overview card
            if (k.installed && isConfigValid) {
              valKiloAuth.innerHTML = '<span class="dot"></span> Ready';
              valKiloAuth.className = 'card-value status-healthy';
              valKiloCreds.textContent = (k.target?.name || 'Global') + ' (v' + (k.version || '7.2.0') + ')';
            } else {
              valKiloAuth.innerHTML = '<span class="dot"></span> Needs Config';
              valKiloAuth.className = 'card-value status-warning';
            }

            // Kilo Configuration Section
            if (valKiloTargetPath) {
              valKiloTargetPath.textContent = k.target?.displayPath || k.config?.path || '~/.config/kilo/kilo.jsonc';
            }

            if (valKiloUsedBy && k.target?.usedBy) {
              valKiloUsedBy.textContent = 'Used by: ' + k.target.usedBy.join('  ');
            }

            if (valKiloInstall) {
              valKiloInstall.innerHTML = '<span class="dot"></span> ' + (k.installed ? 'Detected ' + (k.version || '7.2.0') : 'Not Installed');
              valKiloInstall.className = 'runtime-val ' + (k.installed ? 'status-healthy' : 'status-error');
            }

            if (valKiloAuthState) {
              valKiloAuthState.innerHTML = '<span class="dot"></span> ' + (k.auth?.authenticated ? 'Authenticated' : 'Not Authenticated');
              valKiloAuthState.className = 'runtime-val ' + (k.auth?.authenticated ? 'status-healthy' : 'status-warning');
            }

            if (valKiloValidity) {
              valKiloValidity.innerHTML = '<span class="dot"></span> ' + (isConfigValid ? 'Valid' : 'Incomplete');
              valKiloValidity.className = 'runtime-val ' + (isConfigValid ? 'status-healthy' : 'status-warning');
            }

            if (valKiloProviderId) {
              valKiloProviderId.textContent = k.config?.defaultProvider || 'genspark-llm-proxy';
            }

            if (valKiloEndpoint) {
              valKiloEndpoint.textContent = k.config?.endpoint || 'https://www.genspark.ai/api/llm_proxy/v1';
            }

            if (valKiloModelCount) {
              valKiloModelCount.textContent = (k.config?.modelCount || 36) + ' available';
            }

            if (valKiloActiveModel) {
              valKiloActiveModel.textContent = k.config?.activeModel || 'claude-sonnet-4-6';
            }
          }

          // Update Bootstrap Checklist
          if (bootRes.status === 'fulfilled' && bootRes.value) {
            const b = bootRes.value;
            if (valBootstrapStatus) {
              valBootstrapStatus.innerHTML = '<span class="dot"></span> ' + b.status;
              valBootstrapStatus.className = b.status === 'READY' ? 'status-healthy' : 'status-warning';
            }
            if (chkOs && b.machine) chkOs.textContent = (b.checks.os ? '✓ ' : '✗ ') + b.machine.os + ' (' + b.machine.arch + ')';
            if (chkInternet) chkInternet.textContent = (b.checks.internet ? '✓ ' : '✗ ') + 'Internet';
            if (chkBun && b.machine) chkBun.textContent = (b.checks.bun ? '✓ ' : '✗ ') + 'Bun ' + (b.machine.bun || '');
            if (chkNode && b.machine) chkNode.textContent = (b.checks.node ? '✓ ' : '✗ ') + 'Node ' + (b.machine.node || '');
            if (chkGsk) chkGsk.textContent = (b.checks.gensparkCli ? '✓ ' : '✗ ') + 'GenSpark CLI';
            if (chkKilo) chkKilo.textContent = (b.checks.kiloCli ? '✓ ' : '✗ ') + 'Kilo Code';
          }

          // Update Dynamic Models count
          if (catalogRes.status === 'fulfilled' && catalogRes.value) {
            const m = catalogRes.value;
            if (m.total) {
              valModels.textContent = m.total + ' Available';
            }
          }

          // Update Notifications
          if (notifsRes.status === 'fulfilled' && notifsRes.value) {
            const n = notifsRes.value;
            if (n.active && n.active.length > 0) {
              notifsEl.innerHTML = n.active.map(notif => \`
                <div class="notification-banner">
                  <div class="notification-content">
                    <div class="notification-title">\${notif.type}: \${notif.title}</div>
                    <div>\${notif.message}</div>
                  </div>
                  \${notif.actionLabel ? \`<button class="btn" onclick="handleNotifAction('\${notif.actionType}')">\${notif.actionLabel}</button>\` : ''}
                </div>
              \`).join('');
            } else {
              notifsEl.innerHTML = '';
            }
          }

          if (updatedEl) {
            const d = new Date();
            updatedEl.textContent = 'Updated ' + d.toLocaleTimeString();
          }
        } catch (err) {
          if (updatedEl) updatedEl.textContent = 'Partial Update';
        } finally {
          if (refreshBtn) refreshBtn.disabled = false;
        }
      }

      // Target selection change handler
      if (kiloTargetSelect) {
        kiloTargetSelect.addEventListener('change', () => {
          refreshData();
        });
      }

      // Bootstrap Setup & Repair Handlers
      if (setupBtn) {
        setupBtn.addEventListener('click', async () => {
          setupBtn.disabled = true;
          if (bootstrapActionStatus) bootstrapActionStatus.textContent = 'Running setup...';
          try {
            const res = await fetch('/api/bootstrap/setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ components: ['genspark', 'kilo', 'config'] })
            }).then(r => r.json());

            if (bootstrapActionStatus) {
              bootstrapActionStatus.innerHTML = '<span style="color:' + (res.success ? 'var(--color-green)' : 'var(--color-orange)') + '">' + (res.success ? '✓ Setup complete' : '⚠ Setup finished with items to verify') + '</span>';
            }
            await refreshData();
          } catch (e) {
            if (bootstrapActionStatus) bootstrapActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Setup failed: ' + e.message + '</span>';
          } finally {
            setupBtn.disabled = false;
          }
        });
      }

      if (repairBtn) {
        repairBtn.addEventListener('click', async () => {
          repairBtn.disabled = true;
          if (bootstrapActionStatus) bootstrapActionStatus.textContent = 'Checking environment...';
          try {
            const res = await fetch('/api/bootstrap/repair', { method: 'POST' }).then(r => r.json());
            if (bootstrapActionStatus) {
              bootstrapActionStatus.innerHTML = '<span style="color:var(--color-green)">✓ Diagnostics: ' + res.repairsApplied + '/' + res.issuesFound + ' repaired (' + res.status + ')</span>';
            }
            await refreshData();
          } catch (e) {
            if (bootstrapActionStatus) bootstrapActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Repair error: ' + e.message + '</span>';
          } finally {
            repairBtn.disabled = false;
          }
        });
      }

      // Profile Export & Import Handlers
      if (exportProfileBtn) {
        exportProfileBtn.addEventListener('click', async () => {
          try {
            const res = await fetch('/api/bootstrap/profile/export');
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'gsk-kilo-profile.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            if (profileActionStatus) profileActionStatus.innerHTML = '<span style="color:var(--color-green)">✓ Profile exported</span>';
          } catch (e) {
            if (profileActionStatus) profileActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Export failed</span>';
          }
        });
      }

      if (importFileInput) {
        importFileInput.addEventListener('change', async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async (evt) => {
            try {
              const content = JSON.parse(evt.target.result);
              const res = await fetch('/api/bootstrap/profile/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(content)
              }).then(r => r.json());

              if (res.success) {
                if (profileActionStatus) profileActionStatus.innerHTML = '<span style="color:var(--color-green)">✓ ' + res.message + '</span>';
              } else {
                if (profileActionStatus) profileActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ ' + res.message + '</span>';
              }
              await refreshData();
            } catch (err) {
              if (profileActionStatus) profileActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Invalid profile JSON</span>';
            }
          };
          reader.readAsText(file);
        });
      }

      // Kilo Configuration Action Handlers
      if (kiloSyncBtn) {
        kiloSyncBtn.addEventListener('click', async () => {
          kiloSyncBtn.disabled = true;
          const target = getSelectedKiloTarget();
          if (kiloActionStatus) kiloActionStatus.textContent = 'Syncing configuration...';
          try {
            const res = await fetch('/api/kilo/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target })
            }).then(r => r.json());
            if (kiloActionStatus) {
              kiloActionStatus.innerHTML = '<span style="color:var(--color-green)">✓ ' + (res.message || 'Synchronized') + '</span>';
            }
            await refreshData();
          } catch (e) {
            if (kiloActionStatus) kiloActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Sync failed: ' + e.message + '</span>';
          } finally {
            kiloSyncBtn.disabled = false;
          }
        });
      }

      if (kiloValidateBtn) {
        kiloValidateBtn.addEventListener('click', async () => {
          kiloValidateBtn.disabled = true;
          const target = getSelectedKiloTarget();
          if (kiloActionStatus) kiloActionStatus.textContent = 'Validating configuration...';
          try {
            const res = await fetch('/api/kilo/validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ target })
            }).then(r => r.json());
            if (res.valid) {
              if (kiloActionStatus) {
                kiloActionStatus.innerHTML = '<span style="color:var(--color-green)">✓ Valid (' + res.details.targetName + ': ' + res.details.modelCount + ' models)</span>';
              }
            } else {
              if (kiloActionStatus) {
                kiloActionStatus.innerHTML = '<span style="color:var(--color-orange)">⚠ ' + res.details.targetName + ' incomplete. Click Sync to repair.</span>';
              }
            }
            await refreshData();
          } catch (e) {
            if (kiloActionStatus) kiloActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Validation error: ' + e.message + '</span>';
          } finally {
            kiloValidateBtn.disabled = false;
          }
        });
      }

      // Test Modal Controls (Explicit user trigger with warning)
      if (kiloTestBtn && testModal) {
        kiloTestBtn.addEventListener('click', () => {
          testModal.style.display = 'flex';
        });
      }

      if (modalCancelBtn && testModal) {
        modalCancelBtn.addEventListener('click', () => {
          testModal.style.display = 'none';
        });
      }

      if (modalTestBtn && testModal) {
        modalTestBtn.addEventListener('click', async () => {
          testModal.style.display = 'none';
          if (kiloTestBtn) kiloTestBtn.disabled = true;
          const target = getSelectedKiloTarget();
          if (kiloActionStatus) kiloActionStatus.textContent = 'Testing inference...';

          try {
            const res = await fetch('/api/kilo/test', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                target,
                modelId: 'genspark-llm-proxy/claude-sonnet-4-6',
                prompt: 'Respond with exactly: GENSPARK_KILO_CONNECTION_OK'
              })
            }).then(r => r.json());

            if (res.success && res.status === 'PASS') {
              if (kiloActionStatus) {
                kiloActionStatus.innerHTML = '<span style="color:var(--color-green)">✓ PASS (' + res.latencyMs + 'ms)</span>';
              }
            } else {
              if (kiloActionStatus) {
                kiloActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ FAIL: ' + (res.error || 'Connection failed') + '</span>';
              }
            }
          } catch (e) {
            if (kiloActionStatus) kiloActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ Error: ' + e.message + '</span>';
          } finally {
            if (kiloTestBtn) kiloTestBtn.disabled = false;
            await refreshData();
          }
        });
      }

      if (kiloOpenBtn) {
        kiloOpenBtn.addEventListener('click', async () => {
          kiloOpenBtn.disabled = true;
          try {
            const res = await fetch('/api/kilo/launch', { method: 'POST' }).then(r => r.json());
            if (kiloActionStatus) {
              kiloActionStatus.innerHTML = '<span style="color:var(--color-blue)">🚀 ' + (res.message || 'Kilo is ready') + '</span>';
            }
          } catch (e) {
            if (kiloActionStatus) kiloActionStatus.innerHTML = '<span style="color:var(--color-red)">✗ ' + e.message + '</span>';
          } finally {
            kiloOpenBtn.disabled = false;
          }
        });
      }

      // Sync Catalog Button
      if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
          syncBtn.disabled = true;
          syncBtn.textContent = 'Syncing...';
          try {
            await fetch('/api/genspark/sync', { method: 'POST' });
            await refreshData();
          } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<span aria-hidden="true">⚡</span> Sync Catalog';
          }
        });
      }

      // Stop Server and Exit Handlers
      async function handleStopServer(actionName) {
        const confirmed = confirm(
          'Stop GSK-KILO control plane?\\n\\n' +
          'This will stop the local dashboard/server.\\n\\n' +
          'Your GenSpark and Kilo credentials, configuration, and installed tools will remain unchanged.'
        );
        if (!confirmed) return;

        if (stopServerBtn) stopServerBtn.disabled = true;
        if (exitServerBtn) exitServerBtn.disabled = true;
        if (heartbeatTimer) clearInterval(heartbeatTimer);

        try {
          await fetch('/api/control/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: actionName })
          });
        } catch {}

        const appContainer = document.getElementById('app-container');
        if (appContainer) {
          appContainer.innerHTML = \`
            <header>
              <div>
                <h1 class="brand-title"><span>⚡ GSK-KILO</span></h1>
                <p class="brand-subtitle">Portable Local AI Environment</p>
              </div>
              <div class="badge-local" style="color:var(--color-orange); background:rgba(240,136,62,0.12); border-color:rgba(240,136,62,0.35);">
                <span class="dot"></span>
                <span>STOPPED</span>
              </div>
            </header>
            <div style="padding: 2rem 0; text-align: center;">
              <h2 style="font-size: 1.3rem; margin-bottom: 0.75rem;">GSK-KILO Stopped</h2>
              <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                The control plane server (PID \${${process.pid}}) is no longer running.
              </p>
              <p style="color: var(--text-muted); font-size: 0.88rem; margin-bottom: 1.5rem;">
                Port \${${currentPort}} has been released. Your credentials and configuration remain intact.
              </p>
              <div style="background: var(--bg-card); padding: 1rem; border-radius: 8px; display: inline-block; text-align: left; font-family: monospace; font-size: 0.85rem; border: 1px solid var(--border-subtle);">
                # To restart the control plane, run in your terminal:<br/>
                <span style="color: var(--color-green);">gsk-kilo</span>
              </div>
            </div>
          \`;
        }
      }

      if (stopServerBtn) {
        stopServerBtn.addEventListener('click', () => handleStopServer('gui_stop_server'));
      }
      if (exitServerBtn) {
        exitServerBtn.addEventListener('click', () => handleStopServer('gui_exit_server'));
      }

      // Heartbeat sender loop
      async function sendHeartbeat() {
        try {
          const res = await fetch('/api/heartbeat', { method: 'POST' });
          if (res.ok && valHeartbeat) {
            valHeartbeat.innerHTML = '<span class="dot pulse"></span> Connected';
            valHeartbeat.className = 'runtime-val status-healthy';
          }
        } catch {
          if (valHeartbeat) {
            valHeartbeat.innerHTML = '<span class="dot"></span> Disconnected';
            valHeartbeat.className = 'runtime-val status-warning';
          }
        }
      }

      if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
      }

      // Initial async refresh & heartbeat
      refreshData();
      sendHeartbeat();
      heartbeatTimer = setInterval(sendHeartbeat, 15000);
    })();
  </script>
</body>
</html>`);
  });
}

module.exports = rootRoutes;
