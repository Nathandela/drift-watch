import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readCodexThreadMetadata } from './codex-sqlite.js';

vi.mock('node:child_process');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

describe('readCodexThreadMetadata', () => {
  let execFileSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const cp = await import('node:child_process');
    execFileSync = vi.mocked(cp.execFileSync);
    // Re-mock existsSync to return true (cleared by clearAllMocks)
    const fs = await import('node:fs');
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  it('returns thread metadata from sqlite3 query', () => {
    const threads = [
      {
        id: 'thread-001',
        rollout_path:
          '/Users/test/.codex/sessions/2026/03/08/rollout-2026-03-08T09-00-00-thread-001.jsonl',
        cwd: '/Users/test/my-project',
        model_provider: 'openai',
        title: 'Fix the auth bug',
        created_at: 1741392000,
        updated_at: 1741392060,
        git_branch: 'main',
        git_origin_url: 'https://github.com/test/repo',
        source: 'cli',
      },
    ];
    execFileSync.mockReturnValue(JSON.stringify(threads));

    const result = readCodexThreadMetadata('/Users/test/.codex');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('thread-001');
    expect(result[0].cwd).toBe('/Users/test/my-project');
    expect(result[0].rolloutPath).toBe(threads[0].rollout_path);
  });

  it('returns empty array when sqlite3 is not available', () => {
    execFileSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = readCodexThreadMetadata('/Users/test/.codex');
    expect(result).toHaveLength(0);
  });

  it('returns empty array when database does not exist', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('Error: unable to open database');
    });

    const result = readCodexThreadMetadata('/Users/test/.codex');
    expect(result).toHaveLength(0);
  });

  it('returns empty array on malformed JSON output', () => {
    execFileSync.mockReturnValue('not json');

    const result = readCodexThreadMetadata('/Users/test/.codex');
    expect(result).toHaveLength(0);
  });

  it('filters by since date using updated_at', () => {
    const threads = [
      {
        id: 'thread-001',
        rollout_path: '/path/to/rollout.jsonl',
        cwd: '/project',
        model_provider: 'openai',
        title: 'Old thread',
        created_at: 1700000000,
        updated_at: 1700000000,
        git_branch: null,
        git_origin_url: null,
        source: 'cli',
      },
    ];
    execFileSync.mockReturnValue(JSON.stringify(threads));

    const since = new Date('2026-01-01');
    readCodexThreadMetadata('/Users/test/.codex', since);

    // The sqlite3 command should include a WHERE clause
    // args are ['-json', dbPath, query]
    const call = execFileSync.mock.calls[0];
    expect(call[1][2]).toContain('updated_at >=');
  });
});
