import { ulid } from 'ulid';
import type { Connection, RowDataPacket } from 'mysql2/promise';

export interface Scan {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  sessions_scanned: number;
  findings_count: number;
}

export interface Finding {
  id: string;
  scan_id: string;
  session_id: string;
  source: string;
  title: string;
  description: string | null;
  severity: string;
  created_at: Date;
}

export interface Pattern {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  category: string | null;
  created_at: Date;
}

export interface FindingPattern {
  finding_id: string;
  pattern_id: string;
  confidence: number;
}

export interface Suggestion {
  id: string;
  finding_id: string;
  title: string;
  description: string | null;
  action_type: string | null;
  created_at: Date;
}

export class Repository {
  constructor(private conn: Connection) {}

  // Scans
  async insertScan(data: Omit<Scan, 'id'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO scans (id, started_at, finished_at, status, sessions_scanned, findings_count) VALUES (?, ?, ?, ?, ?, ?)',
      [
        id,
        data.started_at,
        data.finished_at,
        data.status,
        data.sessions_scanned,
        data.findings_count,
      ],
    );
    return id;
  }

  async getScan(id: string): Promise<Scan | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>('SELECT * FROM scans WHERE id = ?', [
      id,
    ]);
    return (rows[0] as Scan) ?? null;
  }

  async updateScan(
    id: string,
    data: Partial<Pick<Scan, 'finished_at' | 'status' | 'sessions_scanned' | 'findings_count'>>,
  ): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (fields.length === 0) return;
    values.push(id);
    await this.conn.execute(`UPDATE scans SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async listScans(): Promise<Scan[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM scans ORDER BY started_at DESC',
    );
    return rows as Scan[];
  }

  // Findings
  async insertFinding(data: Omit<Finding, 'id' | 'created_at'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO findings (id, scan_id, session_id, source, title, description, severity) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, data.scan_id, data.session_id, data.source, data.title, data.description, data.severity],
    );
    return id;
  }

  async getFinding(id: string): Promise<Finding | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>('SELECT * FROM findings WHERE id = ?', [
      id,
    ]);
    return (rows[0] as Finding) ?? null;
  }

  async listFindingsByScan(scanId: string): Promise<Finding[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM findings WHERE scan_id = ?',
      [scanId],
    );
    return rows as Finding[];
  }

  // Patterns
  async insertPattern(data: Omit<Pattern, 'id' | 'created_at'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO patterns (id, name, description, severity, category) VALUES (?, ?, ?, ?, ?)',
      [id, data.name, data.description, data.severity, data.category],
    );
    return id;
  }

  async getPattern(id: string): Promise<Pattern | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>('SELECT * FROM patterns WHERE id = ?', [
      id,
    ]);
    return (rows[0] as Pattern) ?? null;
  }

  async listPatterns(): Promise<Pattern[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>('SELECT * FROM patterns ORDER BY name');
    return rows as Pattern[];
  }

  // Finding-Pattern links
  async linkFindingPattern(data: FindingPattern): Promise<void> {
    await this.conn.execute(
      'INSERT INTO finding_patterns (finding_id, pattern_id, confidence) VALUES (?, ?, ?)',
      [data.finding_id, data.pattern_id, data.confidence],
    );
  }

  async getFindingPatterns(findingId: string): Promise<FindingPattern[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM finding_patterns WHERE finding_id = ?',
      [findingId],
    );
    return rows as FindingPattern[];
  }

  // Suggestions
  async insertSuggestion(data: Omit<Suggestion, 'id' | 'created_at'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO suggestions (id, finding_id, title, description, action_type) VALUES (?, ?, ?, ?, ?)',
      [id, data.finding_id, data.title, data.description, data.action_type],
    );
    return id;
  }

  async getSuggestion(id: string): Promise<Suggestion | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM suggestions WHERE id = ?',
      [id],
    );
    return (rows[0] as Suggestion) ?? null;
  }

  async listSuggestionsByFinding(findingId: string): Promise<Suggestion[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM suggestions WHERE finding_id = ?',
      [findingId],
    );
    return rows as Suggestion[];
  }

  // Stats
  async getTableCounts(): Promise<Record<string, number>> {
    const tables = ['scans', 'findings', 'patterns', 'finding_patterns', 'suggestions'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const [rows] = await this.conn.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM ${table}`,
      );
      counts[table] = (rows[0] as { count: number }).count;
    }
    return counts;
  }

  async getLastScan(): Promise<Scan | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM scans ORDER BY started_at DESC LIMIT 1',
    );
    return (rows[0] as Scan) ?? null;
  }
}
