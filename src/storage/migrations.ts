import type { Connection } from 'mysql2/promise';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INT NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  sessions_scanned INT NOT NULL DEFAULT 0,
  findings_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS patterns (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS findings (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  scan_id VARCHAR(26) NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  source VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20) NOT NULL DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (scan_id) REFERENCES scans(id)
);

CREATE TABLE IF NOT EXISTS finding_patterns (
  finding_id VARCHAR(26) NOT NULL,
  pattern_id VARCHAR(26) NOT NULL,
  confidence FLOAT NOT NULL DEFAULT 1.0,
  PRIMARY KEY (finding_id, pattern_id),
  FOREIGN KEY (finding_id) REFERENCES findings(id),
  FOREIGN KEY (pattern_id) REFERENCES patterns(id)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id VARCHAR(26) NOT NULL PRIMARY KEY,
  finding_id VARCHAR(26) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  action_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (finding_id) REFERENCES findings(id)
);
`;

export const SCHEMA_V2_SQL = `
ALTER TABLE scans ADD COLUMN cursor_json TEXT;

ALTER TABLE patterns ADD COLUMN occurrence_count INT NOT NULL DEFAULT 1;
ALTER TABLE patterns ADD COLUMN last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
`;

const CURRENT_VERSION = 2;

export function parseMigrations(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function applyMigrations(conn: Connection): Promise<void> {
  const statements = parseMigrations(SCHEMA_SQL);

  // Ensure schema_version table exists first
  const versionStmt = statements.find((s) => s.includes('schema_version'));
  if (versionStmt) {
    await conn.execute(versionStmt);
  }

  const currentVersion = await getSchemaVersion(conn);
  if (currentVersion >= CURRENT_VERSION) return;

  if (currentVersion < 1) {
    for (const stmt of statements) {
      await conn.execute(stmt);
    }
    await conn.execute('REPLACE INTO schema_version (version) VALUES (?)', [1]);
  }

  if (currentVersion < 2) {
    const v2Stmts = parseMigrations(SCHEMA_V2_SQL);
    for (const stmt of v2Stmts) {
      try {
        await conn.execute(stmt);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (!msg.includes('already exists')) throw err;
      }
    }
    await conn.execute('REPLACE INTO schema_version (version) VALUES (?)', [2]);
  }
}

async function getSchemaVersion(conn: Connection): Promise<number> {
  try {
    const [rows] = await conn.execute('SELECT MAX(version) as v FROM schema_version');
    const result = rows as Array<{ v: number | null }>;
    return result[0]?.v ?? 0;
  } catch {
    return 0;
  }
}
