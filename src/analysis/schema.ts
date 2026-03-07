import { z } from 'zod';

export const CATEGORIES = [
  'repeated_mistake',
  'ignored_instruction',
  'over_engineering',
  'security',
  'anti_pattern',
  'hallucinated_api',
  'inefficient_tools',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const SEVERITIES = [1, 2, 3, 4] as const;

export type Severity = (typeof SEVERITIES)[number];

export const FindingSchema = z.object({
  source: z.enum(['claude', 'codex', 'gemini']),
  model: z.string().optional(),
  project: z.string().optional(),
  session_id: z.string(),
  session_date: z.string(),
  category: z.enum(CATEGORIES),
  severity: z.int().min(1).max(4),
  title: z.string(),
  description: z.string(),
  evidence: z.string(),
  tool_context: z.string().optional(),
});

export type Finding = z.infer<typeof FindingSchema>;

export const AnalysisResponseSchema = z.object({
  findings: z.array(FindingSchema),
});

export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;
