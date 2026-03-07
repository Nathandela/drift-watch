import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Repository, Pattern } from './repository.js';
import type { Finding } from '../analysis/schema.js';
import { matchOrCreatePattern } from './patterns.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    source: 'claude',
    session_id: 'sess-1',
    session_date: '2026-03-01',
    category: 'repeated_mistake',
    severity: 2,
    title: 'Agent loops on same error',
    description: 'The agent kept retrying the same failing command',
    evidence: 'Tried 5 times',
    ...overrides,
  };
}

function makePattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: 'pat-1',
    name: 'Agent loops on same error',
    description: null,
    severity: '2',
    category: 'repeated_mistake',
    occurrence_count: 1,
    last_seen: new Date('2026-03-01'),
    created_at: new Date('2026-03-01'),
    ...overrides,
  };
}

function mockRepo(): Repository {
  return {
    findPatternByCategory: vi.fn().mockResolvedValue(null),
    insertPattern: vi.fn().mockResolvedValue('new-pat-id'),
    updatePatternOccurrence: vi.fn().mockResolvedValue(undefined),
    linkFindingPattern: vi.fn().mockResolvedValue(undefined),
  } as unknown as Repository;
}

describe('matchOrCreatePattern', () => {
  let repo: Repository;

  beforeEach(() => {
    repo = mockRepo();
  });

  it('creates a new pattern when no match found', async () => {
    const finding = makeFinding();
    const findingId = 'finding-1';

    const patternId = await matchOrCreatePattern(repo, finding, findingId);

    expect(patternId).toBe('new-pat-id');
    expect(repo.insertPattern).toHaveBeenCalledWith({
      name: finding.title,
      description: finding.description,
      severity: String(finding.severity),
      category: finding.category,
    });
    expect(repo.linkFindingPattern).toHaveBeenCalledWith({
      finding_id: findingId,
      pattern_id: 'new-pat-id',
      confidence: 1.0,
    });
  });

  it('matches existing pattern by category + title', async () => {
    const existing = makePattern({ id: 'existing-pat' });
    vi.mocked(repo.findPatternByCategory).mockResolvedValue(existing);

    const finding = makeFinding();
    const findingId = 'finding-2';

    const patternId = await matchOrCreatePattern(repo, finding, findingId);

    expect(patternId).toBe('existing-pat');
    expect(repo.updatePatternOccurrence).toHaveBeenCalledWith('existing-pat');
    expect(repo.insertPattern).not.toHaveBeenCalled();
    expect(repo.linkFindingPattern).toHaveBeenCalledWith({
      finding_id: findingId,
      pattern_id: 'existing-pat',
      confidence: 1.0,
    });
  });

  it('creates new pattern when category matches but title differs', async () => {
    vi.mocked(repo.findPatternByCategory).mockResolvedValue(null);

    const finding = makeFinding({ title: 'Different error pattern' });
    const findingId = 'finding-3';

    const patternId = await matchOrCreatePattern(repo, finding, findingId);

    expect(patternId).toBe('new-pat-id');
    expect(repo.insertPattern).toHaveBeenCalled();
  });

  it('links finding to pattern with confidence 1.0', async () => {
    const finding = makeFinding();
    await matchOrCreatePattern(repo, finding, 'f-1');

    expect(repo.linkFindingPattern).toHaveBeenCalledWith(
      expect.objectContaining({ confidence: 1.0 }),
    );
  });
});
