import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { init } from './init.js';
import { status } from './status.js';
import { DoltServer } from '../storage/dolt.js';

const TEST_DIR = path.join(os.tmpdir(), `drift-watch-init-test-${Date.now()}`);

afterAll(async () => {
  const server = new DoltServer(TEST_DIR);
  await server.stop();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('init', () => {
  it('creates data directory and initializes Dolt', async () => {
    await init(TEST_DIR);

    expect(fs.existsSync(path.join(TEST_DIR, 'dolt', '.dolt'))).toBe(true);
  }, 30000);

  it('is idempotent - can run again without error', async () => {
    await expect(init(TEST_DIR)).resolves.not.toThrow();
  }, 30000);
});

describe('status after init', () => {
  it('reports server running with table counts', async () => {
    const result = await status(TEST_DIR);

    expect(result.serverRunning).toBe(true);
    expect(result.port).toBeGreaterThanOrEqual(14307);
    expect(result.tableCounts).toHaveProperty('scans');
    expect(result.tableCounts).toHaveProperty('findings');
    expect(result.tableCounts).toHaveProperty('patterns');
    expect(result.tableCounts).toHaveProperty('finding_patterns');
    expect(result.tableCounts).toHaveProperty('suggestions');
    expect(result.lastScanAt).toBeNull();
  }, 30000);
});
