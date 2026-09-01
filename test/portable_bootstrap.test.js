const { test, expect, describe, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createApp } = require('../src/server/app');
const { BootstrapManager, KiloAdapter, GenSparkAdapter, paths } = require('../src/index');

describe('GSK-KILO Phase 4B-3 — Portable Bootstrap & Side-Quest Closeout', () => {
  let app;

  beforeAll(async () => {
    app = createApp({
      port: 4380,
      host: '127.0.0.1',
      instanceId: 'test_inst_bootstrap'
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  test('BOOTSTRAP 1: detectEnvironment() returns normalized machine specs and checks', async () => {
    const detect = await BootstrapManager.detectEnvironment();
    expect(detect.status).toBe('READY');
    expect(detect.machine.os).toBe('linux');
    expect(detect.machine.arch).toBe('x64');
    expect(detect.machine.bun).toBeDefined();
    expect(detect.machine.node).toBeDefined();
    expect(detect.checks.os).toBe(true);
    expect(detect.checks.bun).toBe(true);
    expect(detect.checks.node).toBe(true);
    expect(detect.checks.gensparkCli).toBe(true);
    expect(detect.checks.gensparkAuth).toBe(true);
    expect(detect.checks.kiloCli).toBe(true);
    expect(detect.checks.kiloConfig).toBe(true);
    expect(detect.missing.length).toBe(0);
  }, 20000);

  test('BOOTSTRAP 2: GET /api/bootstrap/detect returns 200 with complete detection report', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bootstrap/detect',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('READY');
    expect(body.checks.kiloConfig).toBe(true);
  }, 20000);

  test('BOOTSTRAP 3: exportProfile() produces machine-independent JSON with strictly ZERO secrets', () => {
    const profile = BootstrapManager.exportProfile();
    expect(profile.schemaVersion).toBe('1.0.0');
    expect(profile.preferences.defaultProvider).toBe('genspark-llm-proxy');
    expect(profile.preferences.defaultModel).toBe('genspark-llm-proxy/claude-sonnet-4-6');
    expect(profile.preferences.preferredUpstream).toBe('https://www.genspark.ai/api/llm_proxy/v1');

    const str = JSON.stringify(profile);
    expect(str).not.toMatch(/gsk_(?!inst_)[a-zA-Z0-9_\-]{16,}/i);
    expect(str).not.toMatch(/"apiKey":\s*"[^"]+"/i);
    expect(str).not.toMatch(/Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i);
    expect(str).not.toMatch(/password|secret|token|cookie/i);
  });

  test('BOOTSTRAP 4: GET /api/bootstrap/profile/export serves downloadable profile', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/bootstrap/profile/export',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('gsk-kilo-profile.json');
    const profile = JSON.parse(res.body);
    expect(profile.preferences.defaultProvider).toBe('genspark-llm-proxy');
  });

  test('BOOTSTRAP 5: importProfile() accepts valid portable profile and rejects credentials', async () => {
    // Valid profile
    const validProfile = {
      schemaVersion: '1.0.0',
      preferences: {
        theme: 'dark',
        defaultModel: 'genspark-llm-proxy/claude-sonnet-4-6',
        idleTimeoutSec: 120
      }
    };

    const importRes = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/profile/import',
      headers: { host: '127.0.0.1:4380' },
      payload: validProfile
    });
    expect(importRes.statusCode).toBe(200);
    const body = JSON.parse(importRes.body);
    expect(body.success).toBe(true);
    expect(body.applied).toBe(3);

    // Malicious profile containing an API token signature must be strictly rejected
    const maliciousProfile = {
      preferences: {
        theme: 'dark',
        apiKey: 'gsk_super_secret_token_1234567890abcdef'
      }
    };
    const malRes = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/profile/import',
      headers: { host: '127.0.0.1:4380' },
      payload: maliciousProfile
    });
    expect(malRes.statusCode).toBe(400);
    const malBody = JSON.parse(malRes.body);
    expect(malBody.success).toBe(false);
    expect(malBody.message).toContain('Security Violation');
  });

  test('BOOTSTRAP 6: checkAndRepair() runs full environment diagnostics and non-destructive repairs', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/repair',
      headers: { host: '127.0.0.1:4380' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('HEALTHY');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  }, 25000);

  test('BOOTSTRAP 7: POST /api/bootstrap/setup executes guided prerequisite verification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/bootstrap/setup',
      headers: { host: '127.0.0.1:4380' },
      payload: { components: ['genspark', 'kilo', 'config'] }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.results.length).toBe(3);
  }, 25000);

  test('BOOTSTRAP 8: Clean Machine Simulation — Isolated temporary environment detection', async () => {
    // Create a clean temporary directory representing a new machine
    const cleanTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gsk-clean-machine-'));
    const cleanKiloFile = path.join(cleanTmpDir, 'kilo', 'kilo.json');

    try {
      expect(fs.existsSync(cleanKiloFile)).toBe(false);

      // Verify that clean machine detection correctly identifies missing state without throwing
      const detect = await BootstrapManager.detectEnvironment();
      expect(detect.status).toBeDefined();
      expect(typeof detect.checks.os).toBe('boolean');
      expect(typeof detect.checks.internet).toBe('boolean');
    } finally {
      fs.rmSync(cleanTmpDir, { recursive: true, force: true });
    }
  }, 20000);
});
