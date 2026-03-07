import { describe, it, expect } from 'vitest';
import { readCodexSession } from './codex.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtureDir = join(import.meta.dirname, '__fixtures__');

describe('readCodexSession', () => {
  it('parses a valid Codex session JSONL', () => {
    const content = readFileSync(join(fixtureDir, 'codex-session.jsonl'), 'utf-8');
    const conv = readCodexSession(content, 'codex-session.jsonl');

    expect(conv.source).toBe('codex');
    expect(conv.sessionId).toBe('codex-session-001');
    expect(conv.project).toBe('/Users/test/codex-project');
    expect(conv.model).toBe('openai');
    expect(conv.sessionDate).toBe('2026-03-01T10:00:00.000Z');
  });

  it('extracts messages from response_item records', () => {
    const content = readFileSync(join(fixtureDir, 'codex-session.jsonl'), 'utf-8');
    const conv = readCodexSession(content, 'codex-session.jsonl');

    const userMsgs = conv.messages.filter((m) => m.role === 'user');
    const assistantMsgs = conv.messages.filter((m) => m.role === 'assistant');
    // developer role maps to user
    expect(userMsgs.length).toBe(1);
    expect(userMsgs[0].content).toBe('Fix the bug in auth.ts');
    // user role in codex means the model's response
    expect(assistantMsgs.length).toBe(1);
  });

  it('extracts tool uses from function_call records', () => {
    const content = readFileSync(join(fixtureDir, 'codex-session.jsonl'), 'utf-8');
    const conv = readCodexSession(content, 'codex-session.jsonl');

    expect(conv.toolUses).toHaveLength(1);
    expect(conv.toolUses[0].name).toBe('shell');
  });

  it('handles empty content', () => {
    const conv = readCodexSession('', 'empty.jsonl');

    expect(conv.messages).toHaveLength(0);
    expect(conv.toolUses).toHaveLength(0);
    expect(conv.sessionId).toBe('empty.jsonl');
  });
});
