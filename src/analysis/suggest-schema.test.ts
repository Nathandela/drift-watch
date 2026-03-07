import { describe, it, expect } from 'vitest';
import { SuggestResponseSchema, STRATEGY_TYPES } from './suggest-schema.js';

describe('SuggestResponseSchema', () => {
  it('validates a valid response', () => {
    const input = {
      suggestions: [
        {
          strategy_type: 'claude_md_patch',
          title: 'Add rule to CLAUDE.md',
          description: 'Prevents repeated over-engineering',
          artifact: '## Rule\nKeep it simple.',
        },
      ],
    };
    const result = SuggestResponseSchema.parse(input);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].strategy_type).toBe('claude_md_patch');
  });

  it('validates response without artifact', () => {
    const input = {
      suggestions: [
        {
          strategy_type: 'user_training',
          title: 'Train users on concise prompts',
          description: 'Users should provide clear, focused instructions.',
        },
      ],
    };
    const result = SuggestResponseSchema.parse(input);
    expect(result.suggestions[0].artifact).toBeUndefined();
  });

  it('validates empty suggestions array', () => {
    const result = SuggestResponseSchema.parse({ suggestions: [] });
    expect(result.suggestions).toHaveLength(0);
  });

  it('rejects invalid strategy_type', () => {
    const input = {
      suggestions: [
        {
          strategy_type: 'invalid_type',
          title: 'Bad',
          description: 'Bad',
        },
      ],
    };
    expect(() => SuggestResponseSchema.parse(input)).toThrow();
  });

  it('rejects missing required fields', () => {
    const input = {
      suggestions: [{ strategy_type: 'claude_md_patch' }],
    };
    expect(() => SuggestResponseSchema.parse(input)).toThrow();
  });
});

describe('STRATEGY_TYPES', () => {
  it('contains all expected types', () => {
    expect(STRATEGY_TYPES).toContain('claude_md_patch');
    expect(STRATEGY_TYPES).toContain('linter_rule');
    expect(STRATEGY_TYPES).toContain('test_case');
    expect(STRATEGY_TYPES).toContain('documentation');
    expect(STRATEGY_TYPES).toContain('user_training');
    expect(STRATEGY_TYPES).toHaveLength(5);
  });
});
