import { ulid } from 'ulid';
import type { Connection, RowDataPacket } from 'mysql2/promise';

export interface Scan {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  sessions_scanned: number;
  findings_count: number;
  cursor_json: string | null;
}

export interface Finding {
  id: string;
  scan_id: string;
  session_id: string;
  source: string;
  title: string;
  description: string | null;
  severity: string;
  model: string | null;
  project: string | null;
  evidence: string | null;
  tool_context: string | null;
  created_at: Date;
}

export interface Pattern {
  id: string;
  name: string;
  description: string | null;
  severity: string;
  category: string | null;
  occurrence_count: number;
  last_seen: Date | null;
  created_at: Date;
}

export interface FindingPattern {
  finding_id: string;
  pattern_id: string;
  confidence: number;
}

export interface Suggestion {
  id: string;
  finding_id: string | null;
  pattern_id: string | null;
  suggest_run_id: string | null;
  title: string;
  description: string | null;
  action_type: string | null;
  artifact: string | null;
  created_at: Date;
}

export interface SuggestRun {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  status: string;
  patterns_processed: number;
  suggestions_count: number;
  created_at: Date;
}

export class Repository {
  constructor(private conn: Connection) {}

  // Scans
  async insertScan(data: Omit<Scan, 'id'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO scans (id, started_at, finished_at, status, sessions_scanned, findings_count, cursor_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        data.started_at,
        data.finished_at,
        data.status,
        data.sessions_scanned,
        data.findings_count,
        data.cursor_json ?? null,
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

  private static readonly SCAN_UPDATE_FIELDS = new Set([
    'finished_at',
    'status',
    'sessions_scanned',
    'findings_count',
    'cursor_json',
  ]);

  async updateScan(
    id: string,
    data: Partial<
      Pick<Scan, 'finished_at' | 'status' | 'sessions_scanned' | 'findings_count' | 'cursor_json'>
    >,
  ): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | Date | null)[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (!Repository.SCAN_UPDATE_FIELDS.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(val as string | number | Date | null);
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
      'INSERT INTO findings (id, scan_id, session_id, source, title, description, severity, model, project, evidence, tool_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        data.scan_id,
        data.session_id,
        data.source,
        data.title,
        data.description,
        data.severity,
        data.model ?? null,
        data.project ?? null,
        data.evidence ?? null,
        data.tool_context ?? null,
      ],
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
  async insertPattern(
    data: Omit<Pattern, 'id' | 'created_at' | 'occurrence_count' | 'last_seen'>,
  ): Promise<string> {
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

  // Suggest Runs
  async insertSuggestRun(data: Omit<SuggestRun, 'id' | 'created_at'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO suggest_runs (id, started_at, finished_at, status, patterns_processed, suggestions_count) VALUES (?, ?, ?, ?, ?, ?)',
      [
        id,
        data.started_at,
        data.finished_at,
        data.status,
        data.patterns_processed,
        data.suggestions_count,
      ],
    );
    return id;
  }

  async getSuggestRun(id: string): Promise<SuggestRun | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM suggest_runs WHERE id = ?',
      [id],
    );
    return (rows[0] as SuggestRun) ?? null;
  }

  private static readonly SUGGEST_RUN_UPDATE_FIELDS = new Set([
    'finished_at',
    'status',
    'patterns_processed',
    'suggestions_count',
  ]);

  async updateSuggestRun(
    id: string,
    data: Partial<
      Pick<SuggestRun, 'finished_at' | 'status' | 'patterns_processed' | 'suggestions_count'>
    >,
  ): Promise<void> {
    const fields: string[] = [];
    const values: (string | number | Date | null)[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (!Repository.SUGGEST_RUN_UPDATE_FIELDS.has(key)) continue;
      fields.push(`${key} = ?`);
      values.push(val as string | number | Date | null);
    }
    if (fields.length === 0) return;
    values.push(id);
    await this.conn.execute(`UPDATE suggest_runs SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  async listSuggestRuns(limit = 50): Promise<SuggestRun[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM suggest_runs ORDER BY started_at DESC LIMIT ?',
      [limit],
    );
    return rows as SuggestRun[];
  }

  async listSuggestionsByRun(runId: string): Promise<Suggestion[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM suggestions WHERE suggest_run_id = ?',
      [runId],
    );
    return rows as Suggestion[];
  }

  // Suggestions
  async insertSuggestion(data: Omit<Suggestion, 'id' | 'created_at'>): Promise<string> {
    const id = ulid();
    await this.conn.execute(
      'INSERT INTO suggestions (id, finding_id, pattern_id, suggest_run_id, title, description, action_type, artifact) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        data.finding_id ?? null,
        data.pattern_id ?? null,
        data.suggest_run_id ?? null,
        data.title,
        data.description,
        data.action_type,
        data.artifact ?? null,
      ],
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

  async listSuggestionsByPattern(patternId: string): Promise<Suggestion[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM suggestions WHERE pattern_id = ?',
      [patternId],
    );
    return rows as Suggestion[];
  }

  async patternsWithSuggestions(): Promise<Set<string>> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT DISTINCT pattern_id FROM suggestions WHERE pattern_id IS NOT NULL',
    );
    return new Set((rows as Array<{ pattern_id: string }>).map((r) => r.pattern_id));
  }

  async patternsWithStaleSuggestions(): Promise<Set<string>> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      `SELECT p.id FROM patterns p
       INNER JOIN suggestions s ON s.pattern_id = p.id
       WHERE p.last_seen > (
         SELECT MAX(s2.created_at) FROM suggestions s2 WHERE s2.pattern_id = p.id
       )
       GROUP BY p.id`,
    );
    return new Set((rows as Array<{ id: string }>).map((r) => r.id));
  }

  async getPatternsSince(since: string, limit: number): Promise<Pattern[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM patterns WHERE last_seen >= ? ORDER BY occurrence_count DESC, severity ASC LIMIT ?',
      [since, limit],
    );
    return rows as Pattern[];
  }

  async listSuggestionsByPatternIds(patternIds: string[]): Promise<Suggestion[]> {
    if (patternIds.length === 0) return [];
    const placeholders = patternIds.map(() => '?').join(', ');
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      `SELECT * FROM suggestions WHERE pattern_id IN (${placeholders}) ORDER BY created_at DESC`,
      patternIds,
    );
    return rows as Suggestion[];
  }

  async getTopPatterns(limit: number): Promise<Pattern[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM patterns ORDER BY occurrence_count DESC, severity ASC LIMIT ?',
      [limit],
    );
    return rows as Pattern[];
  }

  async getExampleFindings(patternId: string, limit = 3): Promise<Finding[]> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT f.* FROM findings f JOIN finding_patterns fp ON f.id = fp.finding_id WHERE fp.pattern_id = ? ORDER BY f.created_at DESC LIMIT ?',
      [patternId, limit],
    );
    return rows as Finding[];
  }

  // Stats
  async getTableCounts(): Promise<Record<string, number>> {
    const tables = [
      'scans',
      'findings',
      'patterns',
      'finding_patterns',
      'suggestions',
      'suggest_runs',
    ];
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

  async getLatestCursors(): Promise<Record<string, string> | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      "SELECT cursor_json FROM scans WHERE status = 'completed' AND cursor_json IS NOT NULL ORDER BY started_at DESC LIMIT 1",
    );
    const row = rows[0] as { cursor_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.cursor_json) as Record<string, string>;
    } catch {
      return null;
    }
  }

  async findPatternByCategory(category: string, name: string): Promise<Pattern | null> {
    const [rows] = await this.conn.execute<RowDataPacket[]>(
      'SELECT * FROM patterns WHERE category = ? AND name = ?',
      [category, name],
    );
    return (rows[0] as Pattern) ?? null;
  }

  async updatePatternOccurrence(id: string): Promise<void> {
    await this.conn.execute(
      'UPDATE patterns SET occurrence_count = occurrence_count + 1, last_seen = NOW() WHERE id = ?',
      [id],
    );
  }

  async doltCommit(message: string): Promise<void> {
    await this.conn.execute("CALL DOLT_ADD('-A')");
    try {
      await this.conn.execute('CALL DOLT_COMMIT(?, ?)', ['-m', message]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      // Dolt returns this when working tree is clean
      if (!msg.includes('nothing to commit')) throw err;
    }
  }
}
