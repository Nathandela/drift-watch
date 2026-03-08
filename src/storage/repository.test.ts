import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import mysql from 'mysql2/promise';
import {
  parseMigrations,
  SCHEMA_SQL,
  SCHEMA_V2_SQL,
  SCHEMA_V3_SQL,
  SCHEMA_V4_SQL,
  SCHEMA_V5_SQL,
} from './migrations.js';
import { Repository } from './repository.js';
import { derivePort } from './dolt.js';

const TEST_DIR = path.join(os.tmpdir(), `drift-watch-repo-test-${Date.now()}`);
const DOLT_DIR = path.join(TEST_DIR, 'dolt');
let conn: mysql.Connection;
let repo: Repository;
let serverPid: number | undefined;
let testPort: number;

beforeAll(async () => {
  fs.mkdirSync(DOLT_DIR, { recursive: true });
  execSync('dolt init --name test --email test@test.com', { cwd: DOLT_DIR });
  execSync('dolt sql -q "CREATE DATABASE IF NOT EXISTS drift_watch"', { cwd: DOLT_DIR });

  testPort = derivePort(TEST_DIR + '-repo-test');

  const child = nodeSpawn(
    'dolt',
    ['sql-server', '--port', String(testPort), '--host', '127.0.0.1'],
    { cwd: DOLT_DIR, detached: true, stdio: 'ignore' },
  );
  child.unref();
  serverPid = child.pid;

  // Wait for server
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

  // Apply schema v1 + v2
  const statements = parseMigrations(SCHEMA_SQL);
  for (const stmt of statements) {
    await conn.execute(stmt);
  }
  const v2Statements = parseMigrations(SCHEMA_V2_SQL);
  for (const stmt of v2Statements) {
    await conn.execute(stmt);
  }
  const v3Statements = parseMigrations(SCHEMA_V3_SQL);
  for (const stmt of v3Statements) {
    await conn.execute(stmt);
  }
  const v4Statements = parseMigrations(SCHEMA_V4_SQL);
  for (const stmt of v4Statements) {
    await conn.execute(stmt);
  }
  const v5Statements = parseMigrations(SCHEMA_V5_SQL);
  for (const stmt of v5Statements) {
    await conn.execute(stmt);
  }

  repo = new Repository(conn);
}, 30000);

afterAll(async () => {
  if (conn) await conn.end().catch(() => {});
  if (serverPid) {
    try {
      process.kill(serverPid, 'SIGTERM');
    } catch {
      // process already gone
    }
  }
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Dolt may still hold file locks briefly after SIGTERM
  }
});

describe('Repository CRUD', () => {
  let scanId: string;
  let findingId: string;
  let patternId: string;
  let suggestionId: string;

  describe('scans', () => {
    it('inserts and retrieves a scan', async () => {
      scanId = await repo.insertScan({
        started_at: new Date('2026-01-01T00:00:00Z'),
        finished_at: null,
        status: 'running',
        sessions_scanned: 0,
        findings_count: 0,
        cursor_json: null,
      });
      expect(scanId).toBeTruthy();

      const scan = await repo.getScan(scanId);
      expect(scan).toBeDefined();
      expect(scan?.status).toBe('running');
    });

    it('updates a scan', async () => {
      await repo.updateScan(scanId, {
        status: 'completed',
        finished_at: new Date('2026-01-01T01:00:00Z'),
        sessions_scanned: 5,
        findings_count: 3,
      });
      const scan = await repo.getScan(scanId);
      expect(scan?.status).toBe('completed');
      expect(scan?.sessions_scanned).toBe(5);
    });

    it('lists scans', async () => {
      const scans = await repo.listScans();
      expect(scans.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('patterns', () => {
    it('inserts and retrieves a pattern', async () => {
      patternId = await repo.insertPattern({
        name: 'Repeated Error',
        description: 'Same error occurs multiple times',
        severity: 'high',
        category: 'drift',
      });
      expect(patternId).toBeTruthy();

      const pattern = await repo.getPattern(patternId);
      expect(pattern?.name).toBe('Repeated Error');
    });

    it('lists patterns', async () => {
      const patterns = await repo.listPatterns();
      expect(patterns.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('findings', () => {
    it('inserts and retrieves a finding', async () => {
      findingId = await repo.insertFinding({
        scan_id: scanId,
        session_id: 'session-123',
        source: 'claude',
        title: 'Loop detected',
        description: 'Agent looped 5 times on same error',
        severity: 'high',
        model: 'claude-sonnet-4-20250514',
        project: '/my-project',
        evidence: 'Line 42: repeated call to fs.readFile',
        tool_context: null,
      });
      expect(findingId).toBeTruthy();

      const finding = await repo.getFinding(findingId);
      expect(finding?.title).toBe('Loop detected');
      expect(finding?.scan_id).toBe(scanId);
    });

    it('lists findings by scan', async () => {
      const findings = await repo.listFindingsByScan(scanId);
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('finding_patterns', () => {
    it('links a finding to a pattern', async () => {
      await repo.linkFindingPattern({
        finding_id: findingId,
        pattern_id: patternId,
        confidence: 0.95,
      });
      const links = await repo.getFindingPatterns(findingId);
      expect(links).toHaveLength(1);
      expect(links[0].confidence).toBeCloseTo(0.95);
    });
  });

  describe('suggestions', () => {
    it('inserts and retrieves a suggestion', async () => {
      suggestionId = await repo.insertSuggestion({
        finding_id: findingId,
        pattern_id: null,
        title: 'Add error boundary',
        description: 'Wrap the failing block in try/catch',
        action_type: 'code_change',
        artifact: null,
      });
      expect(suggestionId).toBeTruthy();

      const suggestion = await repo.getSuggestion(suggestionId);
      expect(suggestion?.title).toBe('Add error boundary');
    });

    it('inserts pattern-linked suggestion with artifact', async () => {
      const id = await repo.insertSuggestion({
        finding_id: null,
        pattern_id: patternId,
        title: 'Add CLAUDE.md rule',
        description: 'Prevent repeated errors',
        action_type: 'claude_md_patch',
        artifact: '## Rule\nDo not repeat this mistake.',
      });
      const suggestion = await repo.getSuggestion(id);
      expect(suggestion?.pattern_id).toBe(patternId);
      expect(suggestion?.artifact).toContain('Rule');
      expect(suggestion?.finding_id).toBeNull();
    });

    it('lists suggestions by finding', async () => {
      const suggestions = await repo.listSuggestionsByFinding(findingId);
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('lists suggestions by pattern', async () => {
      const suggestions = await repo.listSuggestionsByPattern(patternId);
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
      expect(suggestions[0].pattern_id).toBe(patternId);
    });
  });

  describe('top patterns and example findings', () => {
    it('returns top patterns ordered by occurrence', async () => {
      const patterns = await repo.getTopPatterns(5);
      expect(patterns.length).toBeGreaterThanOrEqual(1);
    });

    it('returns example findings for a pattern', async () => {
      const findings = await repo.getExampleFindings(patternId);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].title).toBe('Loop detected');
    });
  });

  describe('stats', () => {
    it('returns table counts', async () => {
      const counts = await repo.getTableCounts();
      expect(counts.scans).toBeGreaterThanOrEqual(1);
      expect(counts.findings).toBeGreaterThanOrEqual(1);
      expect(counts.patterns).toBeGreaterThanOrEqual(1);
      expect(counts.finding_patterns).toBeGreaterThanOrEqual(1);
      expect(counts.suggestions).toBeGreaterThanOrEqual(1);
    });

    it('returns last scan', async () => {
      const last = await repo.getLastScan();
      expect(last).toBeDefined();
      expect(last?.id).toBe(scanId);
    });
  });
});
