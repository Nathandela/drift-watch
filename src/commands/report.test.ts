import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../storage/dolt.js');
vi.mock('../storage/migrations.js');

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
    mockConn.execute.mockResolvedValueOnce([
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
    ]);

    const result = await report({ dataDir: '/fake' });

    expect(result.mode).toBe('patterns');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Loop detected');
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
