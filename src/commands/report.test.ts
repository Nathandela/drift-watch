import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseReportArgs, parseRelativeDate, printReport } from './report.js';
import type { ReportResult } from './report.js';

vi.mock('../storage/dolt.js');
vi.mock('../storage/migrations.js');

describe('parseReportArgs', () => {
  it('returns empty options for no args', () => {
    expect(parseReportArgs([])).toEqual({});
  });

  it('parses --by-model flag', () => {
    expect(parseReportArgs(['--by-model']).byModel).toBe(true);
  });

  it('parses --by-project flag', () => {
    expect(parseReportArgs(['--by-project']).byProject).toBe(true);
  });

  it('parses --since with date string', () => {
    expect(parseReportArgs(['--since', '2026-02-01']).since).toBe('2026-02-01');
  });

  it('parses --category with value', () => {
    expect(parseReportArgs(['--category', 'security']).category).toBe('security');
  });

  it('parses --limit with number', () => {
    expect(parseReportArgs(['--limit', '10']).limit).toBe(10);
  });

  it('throws when --limit is not a positive integer', () => {
    expect(() => parseReportArgs(['--limit', '0'])).toThrow('--limit must be a positive integer');
    expect(() => parseReportArgs(['--limit', '-1'])).toThrow('--limit must be a positive integer');
    expect(() => parseReportArgs(['--limit', 'abc'])).toThrow('--limit must be a positive integer');
  });

  it('throws when flag is missing required value', () => {
    expect(() => parseReportArgs(['--since'])).toThrow('--since requires a value');
    expect(() => parseReportArgs(['--category'])).toThrow('--category requires a value');
    expect(() => parseReportArgs(['--limit'])).toThrow('--limit requires a value');
  });

  it('parses --since with relative date', () => {
    const result = parseReportArgs(['--since', '7d']);
    expect(result.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('parses multiple flags combined', () => {
    const opts = parseReportArgs([
      '--since',
      '2026-01-01',
      '--category',
      'security',
      '--limit',
      '5',
    ]);
    expect(opts.since).toBe('2026-01-01');
    expect(opts.category).toBe('security');
    expect(opts.limit).toBe(5);
  });
});

describe('parseRelativeDate', () => {
  it('converts "7d" to approximately 7 days ago', () => {
    const result = parseRelativeDate('7d');
    const date = new Date(result);
    const diff = Date.now() - date.getTime();
    expect(diff).toBeGreaterThan(6 * 86400000);
    expect(diff).toBeLessThan(8 * 86400000);
  });

  it('converts "2w" to approximately 14 days ago', () => {
    const result = parseRelativeDate('2w');
    const date = new Date(result);
    const diff = Date.now() - date.getTime();
    expect(diff).toBeGreaterThan(13 * 86400000);
    expect(diff).toBeLessThan(15 * 86400000);
  });

  it('converts "1m" using calendar month subtraction', () => {
    const result = parseRelativeDate('1m');
    const date = new Date(result);
    const now = new Date();
    const expectedMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    expect(date.getMonth()).toBe(expectedMonth);
  });

  it('passes through ISO date strings unchanged', () => {
    expect(parseRelativeDate('2026-01-15')).toBe('2026-01-15');
  });

  it('passes through invalid formats unchanged', () => {
    expect(parseRelativeDate('foo')).toBe('foo');
  });
});

describe('printReport', () => {
  it('prints empty message when no findings', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: ReportResult = { mode: 'patterns', rows: [], empty: true };
    printReport(result);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('No findings yet'));
    spy.mockRestore();
  });

  it('prints patterns table with correct headers', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: ReportResult = {
      mode: 'patterns',
      rows: [
        {
          name: 'Test',
          category: 'security',
          occurrence_count: 3,
          severity: 'high',
          created_at: new Date('2026-01-01'),
          last_seen: new Date('2026-03-01'),
        },
      ],
      empty: false,
    };
    printReport(result);
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Title');
    expect(output).toContain('Category');
    expect(output).toContain('Test');
    spy.mockRestore();
  });

  it('prints by-model table', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: ReportResult = {
      mode: 'by-model',
      rows: [{ model: 'claude', finding_count: 10, pattern_count: 3 }],
      empty: false,
    };
    printReport(result);
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Model');
    expect(output).toContain('claude');
    spy.mockRestore();
  });

  it('prints by-project table', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: ReportResult = {
      mode: 'by-project',
      rows: [{ project: '/my-app', finding_count: 15, pattern_count: 4 }],
      empty: false,
    };
    printReport(result);
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Project');
    expect(output).toContain('/my-app');
    spy.mockRestore();
  });

  it('prints summary when available on patterns mode', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: ReportResult = {
      mode: 'patterns',
      rows: [
        {
          name: 'Test',
          category: 'security',
          occurrence_count: 1,
          severity: 'high',
          created_at: '2026-01-01',
          last_seen: '2026-03-01',
        },
      ],
      empty: false,
      summary: {
        totalFindings: 42,
        totalPatterns: 5,
        topPatterns: [{ name: 'Test', count: 10 }],
        mostAffectedProjects: [{ project: '/app', count: 20 }],
      },
    };
    printReport(result);
    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('42');
    expect(output).toContain('Total findings');
    spy.mockRestore();
  });
});

describe('report', () => {
  let report: typeof import('./report.js').report;

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

    const reportModule = await import('./report.js');
    report = reportModule.report;
  });

  it('returns default pattern report sorted by occurrence_count', async () => {
    mockConn.execute
      .mockResolvedValueOnce([
        [
          {
            name: 'Loop detected',
            category: 'repeated_mistake',
            occurrence_count: 5,
            severity: 'high',
            created_at: new Date('2026-01-01'),
            last_seen: new Date('2026-03-01'),
          },
        ],
        [],
      ])
      .mockResolvedValueOnce([[{ total: 10 }], []])
      .mockResolvedValueOnce([[{ total: 3 }], []])
      .mockResolvedValueOnce([[{ name: 'Loop detected', occurrence_count: 5 }], []])
      .mockResolvedValueOnce([[{ project: '/app', count: 7 }], []]);

    const result = await report({ dataDir: '/fake' });

    expect(result.mode).toBe('patterns');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Loop detected');
    expect(result.summary).toBeDefined();
    expect(result.summary?.totalFindings).toBe(10);
  });

  it('returns empty result with message when no patterns', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);

    const result = await report({ dataDir: '/fake' });

    expect(result.rows).toHaveLength(0);
    expect(result.empty).toBe(true);
  });

  it('passes --since filter to query', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);

    await report({ dataDir: '/fake', since: '2026-02-01' });

    const call = mockConn.execute.mock.calls[0];
    expect(call[0]).toContain('last_seen >=');
    expect(call[1]).toContain('2026-02-01');
  });

  it('passes --category filter to query', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);

    await report({ dataDir: '/fake', category: 'security' });

    const call = mockConn.execute.mock.calls[0];
    expect(call[0]).toContain('category =');
    expect(call[1]).toContain('security');
  });

  it('passes --limit to query', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);

    await report({ dataDir: '/fake', limit: 5 });

    const call = mockConn.execute.mock.calls[0];
    expect(call[0]).toContain('LIMIT');
    expect(call[1]).toContain(5);
  });

  it('returns by-model grouping', async () => {
    mockConn.execute.mockResolvedValueOnce([
      [
        { model: 'claude', finding_count: 10, pattern_count: 3 },
        { model: 'codex', finding_count: 5, pattern_count: 2 },
      ],
      [],
    ]);

    const result = await report({ dataDir: '/fake', byModel: true });

    expect(result.mode).toBe('by-model');
    expect(result.rows).toHaveLength(2);
  });

  it('returns by-project grouping', async () => {
    mockConn.execute.mockResolvedValueOnce([
      [{ project: '/my-app', finding_count: 15, pattern_count: 4 }],
      [],
    ]);

    const result = await report({ dataDir: '/fake', byProject: true });

    expect(result.mode).toBe('by-project');
    expect(result.rows).toHaveLength(1);
  });

  it('closes connection after query', async () => {
    mockConn.execute.mockResolvedValueOnce([[], []]);

    await report({ dataDir: '/fake' });

    expect(mockConn.end).toHaveBeenCalled();
  });

  it('closes connection on error', async () => {
    mockConn.execute.mockRejectedValueOnce(new Error('db error'));

    await expect(report({ dataDir: '/fake' })).rejects.toThrow('db error');
    expect(mockConn.end).toHaveBeenCalled();
  });
});
