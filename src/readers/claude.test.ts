import { describe, it, expect } from 'vitest';
import { readClaudeSession } from './claude.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtureDir = join(import.meta.dirname, '__fixtures__');

describe('readClaudeSession', () => {
  it('parses a valid Claude session JSONL', () => {
    const content = readFileSync(join(fixtureDir, 'claude-session.jsonl'), 'utf-8');
    const conv = readClaudeSession(content, 'abc-123', '/Users/test/project');

    expect(conv.source).toBe('claude');
    expect(conv.sessionId).toBe('abc-123');
    expect(conv.project).toBe('/Users/test/project');
    expect(conv.model).toBe('claude-sonnet-4-20250514');
    expect(conv.sessionDate).toBe('2026-03-01T10:00:00.000Z');
  });

  it('extracts user and assistant messages, skipping progress lines', () => {
    const content = readFileSync(join(fixtureDir, 'claude-session.jsonl'), 'utf-8');
    const conv = readClaudeSession(content, 'abc-123', '/Users/test/project');

    // 2 user messages with string content (tool_result user messages are skipped)
    // 2 assistant messages
    const userMsgs = conv.messages.filter((m) => m.role === 'user');
    const assistantMsgs = conv.messages.filter((m) => m.role === 'assistant');
    expect(userMsgs.length).toBe(2);
    expect(assistantMsgs.length).toBe(2);
    expect(userMsgs[0].content).toBe('Hello, can you help me?');
    expect(assistantMsgs[0].content).toBe('Sure, I can help!');
  });

  it('extracts tool uses from assistant messages', () => {
    const content = readFileSync(join(fixtureDir, 'claude-session.jsonl'), 'utf-8');
    const conv = readClaudeSession(content, 'abc-123', '/Users/test/project');

    expect(conv.toolUses).toHaveLength(1);
    expect(conv.toolUses[0].name).toBe('Read');
    expect(conv.toolUses[0].input).toEqual({ file_path: '/Users/test/project/src/index.ts' });
  });

  it('handles malformed JSONL lines gracefully', () => {
    const content = readFileSync(join(fixtureDir, 'malformed.jsonl'), 'utf-8');
    const conv = readClaudeSession(content, 's1', '/test');

    // Should parse the 2 valid lines, skip 2 malformed
    expect(conv.messages.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty content', () => {
    const conv = readClaudeSession('', 'empty', '/test');

    expect(conv.messages).toHaveLength(0);
    expect(conv.toolUses).toHaveLength(0);
    expect(conv.model).toBeUndefined();
  });
});
