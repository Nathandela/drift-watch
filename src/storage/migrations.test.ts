import { describe, it, expect } from 'vitest';
import { parseMigrations, SCHEMA_SQL, SCHEMA_V4_SQL } from './migrations.js';

describe('SCHEMA_SQL', () => {
  it('contains schema SQL content', () => {
    expect(SCHEMA_SQL).toContain('CREATE TABLE');
    expect(SCHEMA_SQL).toContain('scans');
    expect(SCHEMA_SQL).toContain('findings');
    expect(SCHEMA_SQL).toContain('patterns');
    expect(SCHEMA_SQL).toContain('finding_patterns');
    expect(SCHEMA_SQL).toContain('suggestions');
    expect(SCHEMA_SQL).toContain('schema_version');
  });
});

describe('parseMigrations', () => {
  it('splits SQL into individual statements', () => {
    const statements = parseMigrations(SCHEMA_SQL);
    expect(statements.length).toBeGreaterThanOrEqual(6);
    statements.forEach((s) => {
      expect(s.trim()).not.toBe('');
    });
  });

  it('filters out empty statements', () => {
    const statements = parseMigrations('SELECT 1;\n\n;\nSELECT 2;');
    expect(statements).toHaveLength(2);
  });
});

describe('SCHEMA_V4_SQL', () => {
  it('adds pattern_id and artifact columns to suggestions', () => {
    expect(SCHEMA_V4_SQL).toContain('pattern_id');
    expect(SCHEMA_V4_SQL).toContain('artifact');
  });
});
