import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Finding } from '../analysis/schema.js';
import type { NormalizedConversation } from '../readers/types.js';

vi.mock('../readers/index.js');
vi.mock('../analysis/index.js');
vi.mock('../storage/dolt.js');
vi.mock('../storage/migrations.js');
vi.mock('../storage/patterns.js');

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    source: 'claude',
    session_id: 'sess-1',
    session_date: '2026-03-01',
    category: 'repeated_mistake',
    severity: 2,
    title: 'Test finding',
    description: 'desc',
    evidence: 'evidence',
    ...overrides,
  };
}

function makeConversation(overrides: Partial<NormalizedConversation> = {}): NormalizedConversation {
  return {
    source: 'claude',
    model: 'claude-sonnet-4-20250514',
    project: '/project-a',
    sessionId: 'sess-1',
    sessionDate: '2026-03-01',
    messages: [{ role: 'user', content: 'Hello' }],
    toolUses: [],
    ...overrides,
  };
}

describe('scan', () => {
  let scan: typeof import('./scan.js').scan;
  let discoverConversations: ReturnType<typeof vi.fn>;
  let analyze: ReturnType<typeof vi.fn>;
  let matchOrCreatePattern: ReturnType<typeof vi.fn>;

  const mockConn = {
    execute: vi.fn().mockResolvedValue([[], []]),
    end: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const readersModule = await import('../readers/index.js');
    discoverConversations = vi
      .mocked(readersModule.discoverConversations)
      .mockResolvedValue({ conversations: [], maxMtime: null });

    const analysisModule = await import('../analysis/index.js');
    analyze = vi.mocked(analysisModule.analyze).mockResolvedValue([]);

    const patternsModule = await import('../storage/patterns.js');
    matchOrCreatePattern = vi
      .mocked(patternsModule.matchOrCreatePattern)
      .mockResolvedValue('pat-1');

    const doltModule = await import('../storage/dolt.js');
    vi.mocked(doltModule.DoltServer).mockImplementation(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(mockConn),
        }) as unknown as InstanceType<typeof doltModule.DoltServer>,
    );

    const migrationsModule = await import('../storage/migrations.js');
    vi.mocked(migrationsModule.applyMigrations).mockResolvedValue(undefined);

    const scanModule = await import('./scan.js');
    scan = scanModule.scan;
  });

  it('returns early with no findings when no conversations found', async () => {
    const result = await scan('/fake-dir');

    expect(result.sessionsScanned).toBe(0);
    expect(result.findingsCount).toBe(0);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('discovers conversations and analyzes them', async () => {
    const conv = makeConversation();
    discoverConversations.mockResolvedValue({ conversations: [conv], maxMtime: new Date() });

    const findings = [makeFinding()];
    analyze.mockResolvedValue(findings);

    const result = await scan('/fake-dir');

    expect(discoverConversations).toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledWith([conv], { model: 'sonnet' });
    expect(result.sessionsScanned).toBe(1);
    expect(result.findingsCount).toBe(1);
  });

  it('groups conversations by project for batched analysis', async () => {
    const conv1 = makeConversation({ project: '/project-a', sessionId: 'sess-1' });
    const conv2 = makeConversation({ project: '/project-b', sessionId: 'sess-2' });
    const conv3 = makeConversation({ project: '/project-a', sessionId: 'sess-3' });
    discoverConversations.mockResolvedValue({
      conversations: [conv1, conv2, conv3],
      maxMtime: new Date(),
    });

    analyze.mockResolvedValue([]);

    await scan('/fake-dir');

    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it('matches findings to patterns', async () => {
    const conv = makeConversation();
    discoverConversations.mockResolvedValue({ conversations: [conv], maxMtime: new Date() });

    const findings = [makeFinding(), makeFinding({ title: 'Second' })];
    analyze.mockResolvedValue(findings);

    await scan('/fake-dir');

    expect(matchOrCreatePattern).toHaveBeenCalledTimes(2);
  });

  it('calls doltCommit after successful scan', async () => {
    const conv = makeConversation();
    discoverConversations.mockResolvedValue({ conversations: [conv], maxMtime: new Date() });
    analyze.mockResolvedValue([makeFinding()]);

    await scan('/fake-dir');

    // DOLT_ADD + DOLT_COMMIT should be called
    const executeCalls = mockConn.execute.mock.calls.map((c: unknown[]) => c[0]);
    expect(executeCalls).toContain("CALL DOLT_ADD('-A')");
    expect(executeCalls.some((sql: unknown) => sql === 'CALL DOLT_COMMIT(?, ?)')).toBe(true);
  });

  it('calls doltCommit even with zero findings', async () => {
    const conv = makeConversation();
    discoverConversations.mockResolvedValue({ conversations: [conv], maxMtime: new Date() });
    analyze.mockResolvedValue([]);

    await scan('/fake-dir');

    const executeCalls = mockConn.execute.mock.calls.map((c: unknown[]) => c[0]);
    expect(executeCalls).toContain("CALL DOLT_ADD('-A')");
  });

  it('sets scan status to failed on analysis error', async () => {
    const conv = makeConversation();
    discoverConversations.mockResolvedValue({ conversations: [conv], maxMtime: new Date() });
    analyze.mockRejectedValue(new Error('LLM timeout'));

    await expect(scan('/fake-dir')).rejects.toThrow('LLM timeout');

    // Should have UPDATE with 'failed' status
    const executeCalls = mockConn.execute.mock.calls;
    const updateCall = executeCalls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE scans SET'),
    );
    expect(updateCall).toBeDefined();
  });

  it('closes connection after error', async () => {
    const conv = makeConversation();
    discoverConversations.mockResolvedValue({ conversations: [conv], maxMtime: new Date() });
    analyze.mockRejectedValue(new Error('fail'));

    await expect(scan('/fake-dir')).rejects.toThrow('fail');
    expect(mockConn.end).toHaveBeenCalled();
  });

  it('continues when one project group fails but another succeeds', async () => {
    const conv1 = makeConversation({ project: '/ok-project', sessionId: 'sess-ok' });
    const conv2 = makeConversation({ project: '/bad-project', sessionId: 'sess-bad' });
    discoverConversations.mockResolvedValue({
      conversations: [conv1, conv2],
      maxMtime: new Date(),
    });

    analyze.mockResolvedValueOnce([makeFinding()]).mockRejectedValueOnce(new Error('LLM timeout'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await scan('/fake-dir');

    expect(result.findingsCount).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1 project group(s) failed'));
    warnSpy.mockRestore();
  });

  it('uses partial status when some groups fail but others succeed', async () => {
    const conv1 = makeConversation({ project: '/ok-project', sessionId: 'sess-ok' });
    const conv2 = makeConversation({ project: '/bad-project', sessionId: 'sess-bad' });
    discoverConversations.mockResolvedValue({
      conversations: [conv1, conv2],
      maxMtime: new Date(),
    });

    analyze.mockResolvedValueOnce([makeFinding()]).mockRejectedValueOnce(new Error('LLM timeout'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await scan('/fake-dir');

    // Verify updateScan was called with 'partial' status
    const updateCalls = mockConn.execute.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('UPDATE scans SET'),
    );
    const statusCall = updateCalls.find((c: unknown[]) =>
      (c[1] as unknown[])?.some((v: unknown) => v === 'partial'),
    );
    expect(statusCall).toBeDefined();
    warnSpy.mockRestore();
  });

  it('throws when all project groups fail', async () => {
    const conv1 = makeConversation({ project: '/bad-1', sessionId: 'sess-1' });
    const conv2 = makeConversation({ project: '/bad-2', sessionId: 'sess-2' });
    discoverConversations.mockResolvedValue({
      conversations: [conv1, conv2],
      maxMtime: new Date(),
    });

    analyze.mockRejectedValue(new Error('LLM timeout'));

    await expect(scan('/fake-dir')).rejects.toThrow('LLM timeout');
  });
});
