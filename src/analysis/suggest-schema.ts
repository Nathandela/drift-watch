import { z } from 'zod';

export const STRATEGY_TYPES = [
  'claude_md_patch',
  'linter_rule',
  'test_case',
  'documentation',
  'user_training',
] as const;

export type StrategyType = (typeof STRATEGY_TYPES)[number];

export const SuggestionItemSchema = z.object({
  strategy_type: z.enum(STRATEGY_TYPES),
  title: z.string(),
  description: z.string(),
  artifact: z.string().optional(),
});

export type SuggestionItem = z.infer<typeof SuggestionItemSchema>;

export const SuggestResponseSchema = z.object({
  suggestions: z.array(SuggestionItemSchema),
});

export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;
