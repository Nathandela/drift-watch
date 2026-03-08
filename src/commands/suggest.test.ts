import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSuggestArgs, printSuggestions } from './suggest.js';
import type { SuggestResult } from './suggest.js';

vi.mock('../storage/dolt.js');
vi.mock('../storage/migrations.js');
vi.mock('../analysis/runner.js');

describe('parseSuggestArgs', () => {
  it('returns empty options for no args', () => {
    const opts = parseSuggestArgs([]);
    expect(opts.limit).toBeUndefined();
    expect(opts.patternId).toBeUndefined();
  });

  it('parses --limit', () => {
    expect(parseSuggestArgs(['--limit', '3']).limit).toBe(3);
  });

  it('parses --pattern', () => {
    expect(parseSuggestArgs(['--pattern', 'abc123']).patternId).toBe('abc123');
  });

  it('parses both flags', () => {
    const opts = parseSuggestArgs(['--pattern', 'xyz', '--limit', '2']);
    expect(opts.patternId).toBe('xyz');
    expect(opts.limit).toBe(2);
  });

  it('throws when --limit is not a positive integer', () => {
    expect(() => parseSuggestArgs(['--limit', '0'])).toThrow('--limit must be a positive integer');
    expect(() => parseSuggestArgs(['--limit', 'abc'])).toThrow(
      '--limit must be a positive integer',
    );
  });

  it('throws when flag is missing required value', () => {
    expect(() => parseSuggestArgs(['--limit'])).toThrow('--limit requires a value');
    expect(() => parseSuggestArgs(['--pattern'])).toThrow('--pattern requires a value');
  });
});

describe('printSuggestions', () => {
  it('prints empty message when no patterns', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: SuggestResult = { patterns: [], suggestions: [], empty: true };
    printSuggestions(result);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('No patterns'));
    spy.mockRestore();
  });

  it('prints suggestions grouped by pattern', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: SuggestResult = {
      patterns: [{ id: 'p1', name: 'Over-engineering', category: 'over_engineering' }],
      suggestions: [
        {
          patternId: 'p1',
          strategyType: 'claude_md_patch',
          title: 'Add CLAUDE.md rule',
          description: 'Prevent over-engineering',
          artifact: '## Rule\nKeep simple.',
        },
      ],
      empty: false,
    };
    printSuggestions(result);
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Over-engineering');
    expect(output).toContain('Add CLAUDE.md rule');
    expect(output).toContain('claude_md_patch');
    expect(output).toContain('Keep simple');
    spy.mockRestore();
  });

  it('prints multiple suggestions', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: SuggestResult = {
      patterns: [{ id: 'p1', name: 'Repeated mistake', category: 'repeated_mistake' }],
      suggestions: [
        {
          patternId: 'p1',
          strategyType: 'test_case',
          title: 'Add regression test',
          description: 'Catch the mistake early',
        },
        {
          patternId: 'p1',
          strategyType: 'linter_rule',
          title: 'Lint for pattern',
          description: 'Auto-detect the issue',
        },
      ],
      empty: false,
    };
    printSuggestions(result);
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Add regression test');
    expect(output).toContain('Lint for pattern');
    spy.mockRestore();
  });
});

describe('suggest', () => {
  let suggest: typeof import('./suggest.js').suggest;

  const mockConn = {
    execute: vi.fn().mockResolvedValue([[], []]),
    end: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const doltModule = await import('../storage/dolt.js');
    vi.mocked(doltModule.DoltServer).mockImplementation(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(mockConn),
        }) as unknown as InstanceType<typeof doltModule.DoltServer>,
    );

    const migrationsModule = await import('../storage/migrations.js');
    vi.mocked(migrationsModule.applyMigrations).mockResolvedValue(undefined);

    const runnerModule = await import('../analysis/runner.js');
    vi.mocked(runnerModule.ClaudeRunner).mockImplementation(
      () =>
        ({
          runWithSchema: vi.fn().mockResolvedValue({
            suggestions: [
              {
                strategy_type: 'claude_md_patch',
                title: 'Add rule',
                description: 'Prevent drift',
                artifact: '## Rule',
              },
            ],
          }),
        }) as unknown as InstanceType<typeof runnerModule.ClaudeRunner>,
    );

    const suggestModule = await import('./suggest.js');
    suggest = suggestModule.suggest;
  });

  it('returns empty result when no patterns found', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);
    const result = await suggest({ dataDir: '/fake', limit: 5 });
    expect(result.empty).toBe(true);
    expect(result.suggestions).toHaveLength(0);
  });

  it('generates suggestions for top patterns', async () => {
    // getTopPatterns returns patterns
    mockConn.execute
      .mockResolvedValueOnce([
        [
          {
            id: 'p1',
            name: 'Over-engineering',
            description: 'Too complex',
            severity: 'high',
            category: 'over_engineering',
            occurrence_count: 5,
          },
        ],
        [],
      ])
      // getExampleFindings for pattern p1
      .mockResolvedValueOnce([
        [
          {
            id: 'f1',
            title: 'Added unnecessary abstraction',
            description: 'Created factory for one-time use',
          },
        ],
        [],
      ])
      // insertSuggestion
      .mockResolvedValueOnce([{ insertId: 0 }, []])
      // DOLT_ADD
      .mockResolvedValueOnce([[], []])
      // DOLT_COMMIT
      .mockResolvedValueOnce([[], []]);

    const result = await suggest({ dataDir: '/fake', limit: 5 });
    expect(result.empty).toBe(false);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].title).toBe('Add rule');
    expect(result.patterns[0].name).toBe('Over-engineering');
  });

  it('handles --pattern flag to filter specific pattern', async () => {
    // getPattern by id
    mockConn.execute
      .mockResolvedValueOnce([
        [
          {
            id: 'p1',
            name: 'Security issue',
            description: 'XSS risk',
            severity: 'critical',
            category: 'security',
            occurrence_count: 3,
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([
        [{ id: 'f1', title: 'XSS in output', description: 'Unescaped user input' }],
        [],
      ])
      .mockResolvedValueOnce([{ insertId: 0 }, []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);

    const result = await suggest({ dataDir: '/fake', patternId: 'p1', limit: 5 });
    expect(result.empty).toBe(false);
    expect(result.patterns[0].id).toBe('p1');
  });

  it('returns empty when --pattern ID does not exist', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);
    const result = await suggest({ dataDir: '/fake', patternId: 'nonexistent' });
    expect(result.empty).toBe(true);
    expect(result.suggestions).toHaveLength(0);
  });

  it('closes connection after execution', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);
    await suggest({ dataDir: '/fake', limit: 5 });
    expect(mockConn.end).toHaveBeenCalled();
  });

  it('closes connection on error', async () => {
    mockConn.execute.mockRejectedValueOnce(new Error('db error'));
    await expect(suggest({ dataDir: '/fake', limit: 5 })).rejects.toThrow('db error');
    expect(mockConn.end).toHaveBeenCalled();
  });
});
