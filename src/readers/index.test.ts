import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverConversations } from './index.js';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';

const fixtureDir = join(import.meta.dirname, '__fixtures__');

describe('discoverConversations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'drift-watch-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('discovers Claude sessions from a directory', async () => {
    // Set up Claude-like directory structure
    const claudeDir = join(tempDir, '.claude', 'projects', '-Users-test-project');
    mkdirSync(claudeDir, { recursive: true });
    const fixture = readFileSync(join(fixtureDir, 'claude-session.jsonl'), 'utf-8');
    writeFileSync(join(claudeDir, 'abc-123.jsonl'), fixture);

    const { conversations: convs } = await discoverConversations({
      claudeBase: join(tempDir, '.claude'),
      codexBase: join(tempDir, '.codex'),
      geminiBase: join(tempDir, '.gemini'),
    });

    expect(convs).toHaveLength(1);
    expect(convs[0].source).toBe('claude');
    expect(convs[0].sessionId).toBe('abc-123');
  });

  it('discovers Codex sessions from a directory', async () => {
    const codexDir = join(tempDir, '.codex', 'sessions', '2026', '03', '01');
    mkdirSync(codexDir, { recursive: true });
    const fixture = readFileSync(join(fixtureDir, 'codex-session.jsonl'), 'utf-8');
    writeFileSync(join(codexDir, 'rollout-2026-03-01T10-00-00-abc.jsonl'), fixture);

    const { conversations: convs } = await discoverConversations({
      claudeBase: join(tempDir, '.claude'),
      codexBase: join(tempDir, '.codex'),
      geminiBase: join(tempDir, '.gemini'),
    });

    expect(convs).toHaveLength(1);
    expect(convs[0].source).toBe('codex');
  });

  it('discovers Gemini sessions from a directory', async () => {
    const geminiDir = join(tempDir, '.gemini', 'tmp', 'somehash', 'chats');
    mkdirSync(geminiDir, { recursive: true });
    const fixture = readFileSync(join(fixtureDir, 'gemini-session.json'), 'utf-8');
    writeFileSync(join(geminiDir, 'session-2026-03-01T10-00-abc.json'), fixture);

    const { conversations: convs } = await discoverConversations({
      claudeBase: join(tempDir, '.claude'),
      codexBase: join(tempDir, '.codex'),
      geminiBase: join(tempDir, '.gemini'),
    });

    expect(convs).toHaveLength(1);
    expect(convs[0].source).toBe('gemini');
  });

  it('discovers from all sources simultaneously', async () => {
    // Claude
    const claudeDir = join(tempDir, '.claude', 'projects', '-Users-test');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'session1.jsonl'),
      readFileSync(join(fixtureDir, 'claude-session.jsonl'), 'utf-8'),
    );

    // Codex
    const codexDir = join(tempDir, '.codex', 'sessions', '2026', '03', '01');
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(
      join(codexDir, 'rollout-abc.jsonl'),
      readFileSync(join(fixtureDir, 'codex-session.jsonl'), 'utf-8'),
    );

    // Gemini
    const geminiDir = join(tempDir, '.gemini', 'tmp', 'hash1', 'chats');
    mkdirSync(geminiDir, { recursive: true });
    writeFileSync(
      join(geminiDir, 'session-abc.json'),
      readFileSync(join(fixtureDir, 'gemini-session.json'), 'utf-8'),
    );

    const { conversations: convs } = await discoverConversations({
      claudeBase: join(tempDir, '.claude'),
      codexBase: join(tempDir, '.codex'),
      geminiBase: join(tempDir, '.gemini'),
    });

    expect(convs).toHaveLength(3);
    const sources = convs.map((c) => c.source).sort();
    expect(sources).toEqual(['claude', 'codex', 'gemini']);
  });

  it('handles missing source directories gracefully', async () => {
    const { conversations: convs } = await discoverConversations({
      claudeBase: join(tempDir, 'nonexistent-claude'),
      codexBase: join(tempDir, 'nonexistent-codex'),
      geminiBase: join(tempDir, 'nonexistent-gemini'),
    });

    expect(convs).toHaveLength(0);
  });

  it('filters by mtime when since parameter is provided', async () => {
    const claudeDir = join(tempDir, '.claude', 'projects', '-Users-test');
    mkdirSync(claudeDir, { recursive: true });

    const fixture = readFileSync(join(fixtureDir, 'claude-session.jsonl'), 'utf-8');
    const filePath = join(claudeDir, 'old-session.jsonl');
    writeFileSync(filePath, fixture);

    // Set mtime to the past
    const pastDate = new Date('2020-01-01');
    utimesSync(filePath, pastDate, pastDate);

    const { conversations: convs } = await discoverConversations({
      claudeBase: join(tempDir, '.claude'),
      codexBase: join(tempDir, '.codex'),
      geminiBase: join(tempDir, '.gemini'),
      since: new Date('2025-01-01'),
    });

    expect(convs).toHaveLength(0);
  });
});
