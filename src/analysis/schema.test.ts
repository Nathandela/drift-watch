import { describe, it, expect } from 'vitest';
import {
  FindingSchema,
  AnalysisResponseSchema,
  CATEGORIES,
  SEVERITIES,
  type Finding,
  type AnalysisResponse,
} from './schema.js';

describe('FindingSchema', () => {
  const validFinding: Finding = {
    source: 'claude',
    model: 'claude-sonnet-4-20250514',
    project: '/Users/test/project',
    session_id: 'abc-123',
    session_date: '2026-03-01T10:00:00.000Z',
    category: 'repeated_mistake',
    severity: 2,
    title: 'Repeated use of deprecated API',
    description: 'The agent used fs.readFileSync three times despite being corrected.',
    evidence: 'Line 42: fs.readFileSync(...)',
    tool_context: 'Read, Edit',
  };

  it('validates a complete finding', () => {
    const result = FindingSchema.safeParse(validFinding);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('repeated_mistake');
      expect(result.data.severity).toBe(2);
    }
  });

  it('accepts all valid categories', () => {
    for (const category of CATEGORIES) {
      const result = FindingSchema.safeParse({ ...validFinding, category });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    const result = FindingSchema.safeParse({ ...validFinding, category: 'invalid_cat' });
    expect(result.success).toBe(false);
  });

  it('accepts severity 1-4', () => {
    for (const severity of SEVERITIES) {
      const result = FindingSchema.safeParse({ ...validFinding, severity });
      expect(result.success).toBe(true);
    }
  });

  it('rejects severity outside 1-4', () => {
    expect(FindingSchema.safeParse({ ...validFinding, severity: 0 }).success).toBe(false);
    expect(FindingSchema.safeParse({ ...validFinding, severity: 5 }).success).toBe(false);
  });

  it('allows optional fields to be undefined', () => {
    const minimal: Finding = {
      source: 'codex',
      session_id: 'test-session',
      session_date: '2026-03-01',
      category: 'anti_pattern',
      severity: 3,
      title: 'Some finding',
      description: 'Details here',
      evidence: 'Some evidence',
    };
    const result = FindingSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBeUndefined();
      expect(result.data.project).toBeUndefined();
      expect(result.data.tool_context).toBeUndefined();
    }
  });

  it('accepts all valid source types', () => {
    for (const source of ['claude', 'codex', 'gemini'] as const) {
      const result = FindingSchema.safeParse({ ...validFinding, source });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid source', () => {
    const result = FindingSchema.safeParse({ ...validFinding, source: 'chatgpt' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const noTitle = { ...validFinding };
    delete (noTitle as Record<string, unknown>).title;
    expect(FindingSchema.safeParse(noTitle).success).toBe(false);
  });
});

describe('AnalysisResponseSchema', () => {
  it('validates a response with findings', () => {
    const response: AnalysisResponse = {
      findings: [
        {
          source: 'claude',
          session_id: 'abc-123',
          session_date: '2026-03-01',
          category: 'over_engineering',
          severity: 1,
          title: 'Unnecessary abstraction layer',
          description: 'Created factory pattern for simple object creation.',
          evidence: 'class WidgetFactory { ... }',
        },
      ],
    };
    const result = AnalysisResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toHaveLength(1);
    }
  });

  it('validates an empty findings array', () => {
    const result = AnalysisResponseSchema.safeParse({ findings: [] });
    expect(result.success).toBe(true);
  });

  it('rejects non-array findings', () => {
    const result = AnalysisResponseSchema.safeParse({ findings: 'not-an-array' });
    expect(result.success).toBe(false);
  });

  it('rejects response with invalid finding inside', () => {
    const result = AnalysisResponseSchema.safeParse({
      findings: [{ title: 'Missing fields' }],
    });
    expect(result.success).toBe(false);
  });
});
