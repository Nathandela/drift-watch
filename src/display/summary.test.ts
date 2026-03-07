import { describe, it, expect } from 'vitest';
import { formatSummary } from './summary.js';
import type { SummaryData } from './summary.js';

describe('formatSummary', () => {
  it('formats summary with all fields', () => {
    const data: SummaryData = {
      totalFindings: 42,
      totalPatterns: 8,
      topPatterns: [
        { name: 'Repeated error', count: 15 },
        { name: 'Bad API call', count: 10 },
      ],
      mostAffectedProjects: [
        { project: '/my-project', count: 20 },
        { project: '/other', count: 12 },
      ],
    };

    const result = formatSummary(data);
    expect(result).toContain('42');
    expect(result).toContain('8');
    expect(result).toContain('Repeated error');
    expect(result).toContain('15');
    expect(result).toContain('/my-project');
    expect(result).toContain('20');
  });

  it('handles empty top patterns', () => {
    const data: SummaryData = {
      totalFindings: 0,
      totalPatterns: 0,
      topPatterns: [],
      mostAffectedProjects: [],
    };

    const result = formatSummary(data);
    expect(result).toContain('0');
    expect(result).not.toContain('undefined');
  });

  it('shows up to 3 top patterns', () => {
    const data: SummaryData = {
      totalFindings: 100,
      totalPatterns: 10,
      topPatterns: [
        { name: 'A', count: 50 },
        { name: 'B', count: 30 },
        { name: 'C', count: 15 },
        { name: 'D', count: 5 },
      ],
      mostAffectedProjects: [],
    };

    const result = formatSummary(data);
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).not.toContain(' D ');
  });
});
