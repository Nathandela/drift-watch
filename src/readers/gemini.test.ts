import { describe, it, expect } from 'vitest';
import { readGeminiSession } from './gemini.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtureDir = join(import.meta.dirname, '__fixtures__');

describe('readGeminiSession', () => {
  it('parses a valid Gemini session JSON', () => {
    const content = readFileSync(join(fixtureDir, 'gemini-session.json'), 'utf-8');
    const conv = readGeminiSession(content);

    expect(conv.source).toBe('gemini');
    expect(conv.sessionId).toBe('gemini-session-001');
    expect(conv.sessionDate).toBe('2026-03-01T10:00:00.000Z');
    expect(conv.model).toBe('gemini-2.5-pro');
  });

  it('extracts user and assistant messages, skipping errors', () => {
    const content = readFileSync(join(fixtureDir, 'gemini-session.json'), 'utf-8');
    const conv = readGeminiSession(content);

    const userMsgs = conv.messages.filter((m) => m.role === 'user');
    const assistantMsgs = conv.messages.filter((m) => m.role === 'assistant');
    // 2 user messages (string + array content)
    expect(userMsgs.length).toBe(2);
    // 2 gemini messages
    expect(assistantMsgs.length).toBe(2);
    expect(userMsgs[0].content).toBe('Explain this codebase');
    expect(userMsgs[1].content).toBe('Continue');
  });

  it('extracts tool calls from gemini messages', () => {
    const content = readFileSync(join(fixtureDir, 'gemini-session.json'), 'utf-8');
    const conv = readGeminiSession(content);

    expect(conv.toolUses).toHaveLength(1);
    expect(conv.toolUses[0].name).toBe('read_file');
    expect(conv.toolUses[0].input).toEqual({ path: 'src/index.ts' });
  });

  it('handles malformed JSON gracefully', () => {
    const conv = readGeminiSession('not valid json');
    expect(conv.messages).toHaveLength(0);
    expect(conv.toolUses).toHaveLength(0);
  });

  it('handles empty messages array', () => {
    const conv = readGeminiSession(
      JSON.stringify({ sessionId: 'empty', startTime: '2026-01-01', messages: [] }),
    );
    expect(conv.messages).toHaveLength(0);
    expect(conv.sessionId).toBe('empty');
  });
});
