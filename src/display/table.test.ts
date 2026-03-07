import { describe, it, expect } from 'vitest';
import { formatTable } from './table.js';

describe('formatTable', () => {
  it('returns empty-message when rows are empty', () => {
    const result = formatTable([], ['Name', 'Count'], 'No patterns found.');
    expect(result).toBe('No patterns found.');
  });

  it('formats rows with aligned columns', () => {
    const rows = [
      ['Repeated error', 'repeated_mistake', '5', 'high'],
      ['Bad API call', 'hallucinated_api', '12', 'medium'],
    ];
    const headers = ['Title', 'Category', 'Count', 'Severity'];
    const result = formatTable(rows, headers);
    const lines = result.split('\n');

    // Header line
    expect(lines[0]).toContain('Title');
    expect(lines[0]).toContain('Category');
    expect(lines[0]).toContain('Count');
    expect(lines[0]).toContain('Severity');

    // Separator line
    expect(lines[1]).toMatch(/^-+$/);

    // Data lines
    expect(lines[2]).toContain('Repeated error');
    expect(lines[3]).toContain('Bad API call');
  });

  it('pads columns to the widest value', () => {
    const rows = [
      ['Short', '1'],
      ['A much longer title', '100'],
    ];
    const headers = ['Title', 'Count'];
    const result = formatTable(rows, headers);
    const lines = result.split('\n');

    // Both data lines should have same length
    expect(lines[2].length).toBe(lines[3].length);
  });

  it('handles single column', () => {
    const rows = [['alpha'], ['beta']];
    const headers = ['Name'];
    const result = formatTable(rows, headers);
    expect(result).toContain('Name');
    expect(result).toContain('alpha');
  });
});
