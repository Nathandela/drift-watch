import { describe, it, expect } from 'vitest';
import { SUGGEST_SYSTEM_PROMPT } from './suggest-prompt.js';

describe('SUGGEST_SYSTEM_PROMPT', () => {
  it('mentions all strategy types', () => {
    expect(SUGGEST_SYSTEM_PROMPT).toContain('claude_md_patch');
    expect(SUGGEST_SYSTEM_PROMPT).toContain('linter_rule');
    expect(SUGGEST_SYSTEM_PROMPT).toContain('test_case');
    expect(SUGGEST_SYSTEM_PROMPT).toContain('documentation');
    expect(SUGGEST_SYSTEM_PROMPT).toContain('user_training');
  });

  it('describes JSON output format', () => {
    expect(SUGGEST_SYSTEM_PROMPT).toContain('"suggestions"');
    expect(SUGGEST_SYSTEM_PROMPT).toContain('strategy_type');
    expect(SUGGEST_SYSTEM_PROMPT).toContain('artifact');
  });
});
