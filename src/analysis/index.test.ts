import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedConversation } from '../readers/types.js';
import type { Finding } from './schema.js';

vi.mock('./runner.js');
vi.mock('./prompt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./prompt.js')>();
  return {
    ...actual,
    buildSystemPrompt: vi.fn(actual.buildSystemPrompt),
  };
});

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    source: 'claude',
    session_id: 'sess-1',
    session_date: '2026-03-01',
    category: 'repeated_mistake',
    severity: 2,
    title: 'Test finding',
    description: 'A test finding',
    evidence: 'some evidence',
    ...overrides,
  };
}

function makeConversation(overrides: Partial<NormalizedConversation> = {}): NormalizedConversation {
  return {
    source: 'claude',
    model: 'claude-sonnet-4-20250514',
    project: '/Users/test/my-project',
    sessionId: 'sess-1',
    sessionDate: '2026-03-01',
    messages: [{ role: 'user', content: 'Hello' }],
    toolUses: [],
    ...overrides,
  };
}

describe('analyze', () => {
  let analyze: typeof import('./index.js').analyze;
  let ClaudeRunner: typeof import('./runner.js').ClaudeRunner;
  let buildSystemPrompt: typeof import('./prompt.js').buildSystemPrompt;
  let mockRun: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockRun = vi.fn().mockResolvedValue({ findings: [] });

    const runnerModule = await import('./runner.js');
    ClaudeRunner = runnerModule.ClaudeRunner;
    vi.mocked(ClaudeRunner).mockImplementation(
      () => ({ run: mockRun }) as unknown as InstanceType<typeof ClaudeRunner>,
    );

    const promptModule = await import('./prompt.js');
    buildSystemPrompt = promptModule.buildSystemPrompt;

    const indexModule = await import('./index.js');
    analyze = indexModule.analyze;
  });

  it('returns empty array for empty conversations', async () => {
    const result = await analyze([]);
    expect(result).toEqual([]);
  });

  it('processes single conversation and returns findings', async () => {
    const findings = [makeFinding({ title: 'Repeated mistake found' })];
    mockRun.mockResolvedValueOnce({ findings });

    const conv = makeConversation();
    const result = await analyze([conv]);

    expect(result).toEqual(findings);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Repeated mistake found');
  });

  it('aggregates findings from multiple conversations', async () => {
    const findings1 = [makeFinding({ title: 'Finding A', session_id: 'sess-1' })];
    const findings2 = [
      makeFinding({ title: 'Finding B', session_id: 'sess-2' }),
      makeFinding({ title: 'Finding C', session_id: 'sess-2' }),
    ];
    mockRun
      .mockResolvedValueOnce({ findings: findings1 })
      .mockResolvedValueOnce({ findings: findings2 });

    const conv1 = makeConversation({ sessionId: 'sess-1' });
    const conv2 = makeConversation({ sessionId: 'sess-2', source: 'codex' });

    const result = await analyze([conv1, conv2]);

    expect(result).toHaveLength(3);
    expect(result).toEqual([...findings1, ...findings2]);
  });

  it('passes correct options to ClaudeRunner', async () => {
    mockRun.mockResolvedValueOnce({ findings: [] });
    const conv = makeConversation();

    await analyze([conv], { model: 'claude-opus-4-20250514', timeoutMs: 30_000 });

    expect(ClaudeRunner).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-4-20250514', timeoutMs: 30_000 }),
    );
  });

  it('builds system prompt with conversation context', async () => {
    mockRun.mockResolvedValueOnce({ findings: [] });
    const conv = makeConversation({ project: '/my/project', source: 'gemini' });

    await analyze([conv]);

    expect(buildSystemPrompt).toHaveBeenCalledWith({ project: '/my/project', source: 'gemini' });
  });

  it('continues processing when one conversation fails', async () => {
    const findings = [makeFinding({ title: 'Good finding' })];
    mockRun.mockRejectedValueOnce(new Error('LLM timeout')).mockResolvedValueOnce({ findings });

    const conv1 = makeConversation({ sessionId: 'bad-sess' });
    const conv2 = makeConversation({ sessionId: 'good-sess' });

    const result = await analyze([conv1, conv2]);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Good finding');
  });

  it('returns empty findings when all conversations fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockRun.mockRejectedValueOnce(new Error('LLM timeout'));
    const conv = makeConversation();

    const result = await analyze([conv]);
    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LLM timeout'));
    warnSpy.mockRestore();
  });

  it('serializes conversation as JSON for runner input', async () => {
    mockRun.mockResolvedValueOnce({ findings: [] });
    const conv = makeConversation();

    await analyze([conv]);

    const serialized = mockRun.mock.calls[0][0];
    expect(serialized).toBe(JSON.stringify(conv));
  });
});
