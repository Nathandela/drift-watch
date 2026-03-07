import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, SYSTEM_PROMPT } from './prompt.js';
import { CATEGORIES } from './schema.js';

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
  });

  it('mentions all categories', () => {
    for (const category of CATEGORIES) {
      expect(SYSTEM_PROMPT).toContain(category);
    }
  });

  it('mentions severity scale 1-4', () => {
    expect(SYSTEM_PROMPT).toMatch(/severity/i);
    expect(SYSTEM_PROMPT).toMatch(/1.*4|1-4/);
  });

  it('instructs JSON output', () => {
    expect(SYSTEM_PROMPT).toMatch(/JSON/i);
  });

  it('mentions findings array', () => {
    expect(SYSTEM_PROMPT).toMatch(/findings/i);
  });
});

describe('buildSystemPrompt', () => {
  it('returns a string containing the base prompt', () => {
    const result = buildSystemPrompt();
    expect(result).toContain('findings');
  });

  it('includes project context when provided', () => {
    const result = buildSystemPrompt({ project: 'my-app', source: 'claude' });
    expect(result).toContain('my-app');
    expect(result).toContain('claude');
  });

  it('works without options', () => {
    const result = buildSystemPrompt();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(100);
  });
});
