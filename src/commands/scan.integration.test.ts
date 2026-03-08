import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { execSync, spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mysql from 'mysql2/promise';
import { parseMigrations, SCHEMA_SQL, SCHEMA_V2_SQL } from '../storage/migrations.js';
import { Repository } from '../storage/repository.js';
import { derivePort } from '../storage/dolt.js';

vi.mock('../analysis/runner.js');
vi.mock('../storage/dolt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage/dolt.js')>();
  return { ...actual, DoltServer: vi.fn() };
});
vi.mock('../readers/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../readers/index.js')>();
  return { ...actual, discoverConversations: vi.fn(actual.discoverConversations) };
});

const TEST_DIR = path.join(os.tmpdir(), `drift-watch-scan-integration-${Date.now()}`);
const DOLT_DIR = path.join(TEST_DIR, 'dolt');
const CLAUDE_DIR = path.join(TEST_DIR, 'claude-sessions');
let conn: mysql.Connection;
let serverPid: number | undefined;
let testPort: number;

function connectToTest(): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: '127.0.0.1',
    port: testPort,
    user: 'root',
    database: 'drift_watch',
  });
}

function writeClaudeSession(sessionId: string, content: string): void {
  const projectDir = path.join(CLAUDE_DIR, 'projects', '-test-project');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, `${sessionId}.jsonl`), content);
}

function makeClaudeJsonl(sessionId: string): string {
  return [
    JSON.stringify({
      type: 'summary',
      session_id: sessionId,
      model: 'claude-sonnet-4-20250514',
    }),
    JSON.stringify({
      type: 'message',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'Fix the bug' }],
        model: 'claude-sonnet-4-20250514',
      },
    }),
    JSON.stringify({
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'I will fix it.' }],
        model: 'claude-sonnet-4-20250514',
      },
    }),
  ].join('\n');
}

beforeAll(async () => {
  fs.mkdirSync(DOLT_DIR, { recursive: true });
  execSync('dolt init --name test --email test@test.com', { cwd: DOLT_DIR });
  execSync('dolt sql -q "CREATE DATABASE IF NOT EXISTS drift_watch"', { cwd: DOLT_DIR });

  testPort = derivePort(TEST_DIR + '-scan-integration');

  const child = nodeSpawn(
    'dolt',
    ['sql-server', '--port', String(testPort), '--host', '127.0.0.1'],
    { cwd: DOLT_DIR, detached: true, stdio: 'ignore' },
  );
  child.unref();
  serverPid = child.pid;

  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      conn = await mysql.createConnection({
        host: '127.0.0.1',
        port: testPort,
        user: 'root',
        database: 'drift_watch',
        connectTimeout: 1000,
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  for (const stmt of parseMigrations(SCHEMA_SQL)) {
    await conn.execute(stmt);
  }
  for (const stmt of parseMigrations(SCHEMA_V2_SQL)) {
    await conn.execute(stmt);
  }

  await conn.execute('REPLACE INTO schema_version (version) VALUES (?)', [2]);
  await conn.execute("CALL DOLT_ADD('-A')");
  await conn.execute("CALL DOLT_COMMIT('-m', 'initial schema')");

  // Mock ClaudeRunner
  const runnerModule = await import('../analysis/runner.js');
  vi.mocked(runnerModule.ClaudeRunner).mockImplementation(
    () =>
      ({
        run: vi.fn().mockResolvedValue({
          findings: [
            {
              source: 'claude',
              session_id: 'test-sess-1',
              session_date: '2026-03-01',
              category: 'repeated_mistake',
              severity: 2,
              title: 'Agent loops on same error',
              description: 'The agent retried 5 times',
              evidence: 'evidence text',
            },
          ],
        }),
      }) as unknown as InstanceType<typeof runnerModule.ClaudeRunner>,
  );

  // Mock DoltServer to return test connections
  const doltModule = await import('../storage/dolt.js');
  vi.mocked(doltModule.DoltServer).mockImplementation(
    () =>
      ({
        connect: () => connectToTest(),
      }) as unknown as InstanceType<typeof doltModule.DoltServer>,
  );
}, 30000);

afterAll(async () => {
  if (conn) await conn.end().catch(() => {});
  if (serverPid) {
    try {
      process.kill(serverPid, 'SIGTERM');
      // Wait for Dolt process to exit before removing files
      const start = Date.now();
      while (Date.now() - start < 5000) {
        try {
          process.kill(serverPid, 0); // Throws if process is gone
          await new Promise((r) => setTimeout(r, 100));
        } catch {
          break;
        }
      }
    } catch {
      // already gone
    }
  }
  // Retry rmSync in case of lingering file locks
  for (let i = 0; i < 3; i++) {
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
      break;
    } catch {
      if (i < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
});

describe('scan integration', () => {
  it('discovers, analyzes, stores findings, and creates patterns', async () => {
    writeClaudeSession('test-sess-1', makeClaudeJsonl('test-sess-1'));

    // Mock discoverConversations to point at our test dirs
    const readersModule = await import('../readers/index.js');
    const { discoverConversations: realDiscover } =
      await vi.importActual<typeof import('../readers/index.js')>('../readers/index.js');

    vi.mocked(readersModule.discoverConversations).mockImplementation(async (options = {}) => {
      return realDiscover({
        ...options,
        claudeBase: CLAUDE_DIR,
        codexBase: path.join(TEST_DIR, 'codex-empty'),
        geminiBase: path.join(TEST_DIR, 'gemini-empty'),
      });
    });

    const { scan } = await import('./scan.js');
    const result = await scan(TEST_DIR);

    expect(result.sessionsScanned).toBe(1);
    expect(result.findingsCount).toBe(1);

    // Verify stored data
    const freshConn = await connectToTest();
    const repo = new Repository(freshConn);

    const scans = await repo.listScans();
    expect(scans.length).toBeGreaterThanOrEqual(1);
    expect(scans[0].status).toBe('completed');
    expect(scans[0].sessions_scanned).toBe(1);
    expect(scans[0].findings_count).toBe(1);
    expect(scans[0].cursor_json).toBeTruthy();

    const findings = await repo.listFindingsByScan(scans[0].id);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('Agent loops on same error');

    const patterns = await repo.listPatterns();
    const matched = patterns.find((p) => p.name === 'Agent loops on same error');
    expect(matched).toBeDefined();

    const links = await repo.getFindingPatterns(findings[0].id);
    expect(links).toHaveLength(1);
    expect(links[0].pattern_id).toBe(matched?.id);

    await freshConn.end();
  }, 30000);

  it('handles empty scan gracefully (no-op)', async () => {
    const readersModule = await import('../readers/index.js');
    vi.mocked(readersModule.discoverConversations).mockResolvedValue({
      conversations: [],
      maxMtime: null,
    });

    const { scan } = await import('./scan.js');
    const result = await scan(TEST_DIR);

    expect(result.sessionsScanned).toBe(0);
    expect(result.findingsCount).toBe(0);
  }, 30000);
});
