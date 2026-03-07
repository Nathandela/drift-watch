import { describe, it, expect } from 'vitest';
import type {
  NormalizedConversation,
  NormalizedMessage,
  NormalizedToolUse,
  ConversationSource,
} from './types.js';

describe('NormalizedConversation types', () => {
  it('accepts valid conversation data', () => {
    const msg: NormalizedMessage = {
      role: 'user',
      content: 'hello',
      timestamp: '2026-03-01T10:00:00.000Z',
    };

    const tool: NormalizedToolUse = {
      name: 'Read',
      input: { file_path: '/test' },
      result: 'contents',
      timestamp: '2026-03-01T10:00:00.000Z',
    };

    const conv: NormalizedConversation = {
      source: 'claude',
      model: 'claude-sonnet-4-20250514',
      project: '/Users/test/project',
      sessionId: 'abc-123',
      sessionDate: '2026-03-01T10:00:00.000Z',
      messages: [msg],
      toolUses: [tool],
    };

    expect(conv.source).toBe('claude');
    expect(conv.messages).toHaveLength(1);
    expect(conv.toolUses).toHaveLength(1);
  });

  it('accepts all valid source types', () => {
    const sources: ConversationSource[] = ['claude', 'codex', 'gemini'];
    expect(sources).toHaveLength(3);
  });

  it('allows undefined model and project', () => {
    const conv: NormalizedConversation = {
      source: 'gemini',
      model: undefined,
      project: undefined,
      sessionId: 'test',
      sessionDate: '2026-03-01',
      messages: [],
      toolUses: [],
    };

    expect(conv.model).toBeUndefined();
    expect(conv.project).toBeUndefined();
  });
});
