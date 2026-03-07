import { DoltServer } from '../storage/dolt.js';
import { applyMigrations } from '../storage/migrations.js';
import { DEFAULT_DATA_DIR } from './config.js';
import { formatTable } from '../display/table.js';
import { formatSummary } from '../display/summary.js';
import type { SummaryData } from '../display/summary.js';
import type { Connection, RowDataPacket } from 'mysql2/promise';

export interface ReportOptions {
  dataDir?: string;
  byModel?: boolean;
  byProject?: boolean;
  since?: string;
  category?: string;
  limit?: number;
}

export interface ReportResult {
  mode: 'patterns' | 'by-model' | 'by-project';
  rows: Record<string, unknown>[];
  empty: boolean;
  summary?: SummaryData;
}

export async function report(options: ReportOptions = {}): Promise<ReportResult> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const limit = options.limit ?? 20;

  const server = new DoltServer(dataDir);
  const conn = await server.connect();
  await applyMigrations(conn);

  try {
    if (options.byModel) {
      return await queryByModel(conn, options, limit);
    }
    if (options.byProject) {
      return await queryByProject(conn, options, limit);
    }
    const result = await queryPatterns(conn, options, limit);
    if (!result.empty) {
      result.summary = await querySummary(conn);
    }
    return result;
  } finally {
    await conn.end();
  }
}

async function queryPatterns(
  conn: Connection,
  options: ReportOptions,
  limit: number,
): Promise<ReportResult> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.since) {
    conditions.push('last_seen >= ?');
    params.push(options.since);
  }
  if (options.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const sql = `SELECT name, category, occurrence_count, severity, created_at, last_seen FROM patterns ${where} ORDER BY occurrence_count DESC LIMIT ?`;

  const [rows] = (await conn.execute(sql, params)) as [RowDataPacket[], unknown];

  return {
    mode: 'patterns',
    rows: rows as Record<string, unknown>[],
    empty: rows.length === 0,
  };
}

async function queryByModel(
  conn: Connection,
  options: ReportOptions,
  limit: number,
): Promise<ReportResult> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.since) {
    conditions.push('f.created_at >= ?');
    params.push(options.since);
  }
  if (options.category) {
    conditions.push('fp.pattern_id IN (SELECT id FROM patterns WHERE category = ?)');
    params.push(options.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const sql = `SELECT COALESCE(f.model, f.source) as model, COUNT(DISTINCT f.id) as finding_count, COUNT(DISTINCT fp.pattern_id) as pattern_count FROM findings f LEFT JOIN finding_patterns fp ON f.id = fp.finding_id ${where} GROUP BY COALESCE(f.model, f.source) ORDER BY finding_count DESC LIMIT ?`;

  const [rows] = (await conn.execute(sql, params)) as [RowDataPacket[], unknown];

  return {
    mode: 'by-model',
    rows: rows as Record<string, unknown>[],
    empty: rows.length === 0,
  };
}

async function queryByProject(
  conn: Connection,
  options: ReportOptions,
  limit: number,
): Promise<ReportResult> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.since) {
    conditions.push('f.created_at >= ?');
    params.push(options.since);
  }
  if (options.category) {
    conditions.push('fp.pattern_id IN (SELECT id FROM patterns WHERE category = ?)');
    params.push(options.category);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const sql = `SELECT COALESCE(f.project, 'unknown') as project, COUNT(DISTINCT f.id) as finding_count, COUNT(DISTINCT fp.pattern_id) as pattern_count FROM findings f LEFT JOIN finding_patterns fp ON f.id = fp.finding_id ${where} GROUP BY COALESCE(f.project, 'unknown') ORDER BY finding_count DESC LIMIT ?`;

  const [rows] = (await conn.execute(sql, params)) as [RowDataPacket[], unknown];

  return {
    mode: 'by-project',
    rows: rows as Record<string, unknown>[],
    empty: rows.length === 0,
  };
}

async function querySummary(conn: Connection): Promise<SummaryData> {
  const [[countRow]] = (await conn.execute('SELECT COUNT(*) as total FROM findings')) as [
    [{ total: number }],
    unknown,
  ];

  const [[patternCountRow]] = (await conn.execute('SELECT COUNT(*) as total FROM patterns')) as [
    [{ total: number }],
    unknown,
  ];

  const [topRows] = (await conn.execute(
    'SELECT name, occurrence_count FROM patterns ORDER BY occurrence_count DESC LIMIT 3',
  )) as [RowDataPacket[], unknown];

  const [projectRows] = (await conn.execute(
    "SELECT COALESCE(f.project, 'unknown') as project, COUNT(*) as count FROM findings f GROUP BY COALESCE(f.project, 'unknown') ORDER BY count DESC LIMIT 3",
  )) as [RowDataPacket[], unknown];

  return {
    totalFindings: countRow.total,
    totalPatterns: patternCountRow.total,
    topPatterns: topRows.map((r) => ({ name: String(r.name), count: Number(r.occurrence_count) })),
    mostAffectedProjects: projectRows.map((r) => ({
      project: String(r.project),
      count: Number(r.count),
    })),
  };
}

function formatDate(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'string') return val.slice(0, 10);
  return '-';
}

export function printReport(result: ReportResult): void {
  if (result.empty) {
    console.log('No findings yet. Run "drift-watch scan" to analyze conversations.');
    return;
  }

  switch (result.mode) {
    case 'patterns': {
      if (result.summary) {
        console.log(formatSummary(result.summary));
        console.log('');
      }
      const headers = ['Title', 'Category', 'Count', 'Severity', 'First seen', 'Last seen'];
      const rows = result.rows.map((r) => [
        String(r.name ?? ''),
        String(r.category ?? ''),
        String(r.occurrence_count ?? 0),
        String(r.severity ?? ''),
        formatDate(r.created_at),
        formatDate(r.last_seen),
      ]);
      console.log(formatTable(rows, headers));
      break;
    }
    case 'by-model': {
      const headers = ['Model', 'Findings', 'Patterns'];
      const rows = result.rows.map((r) => [
        String(r.model ?? ''),
        String(r.finding_count ?? 0),
        String(r.pattern_count ?? 0),
      ]);
      console.log(formatTable(rows, headers));
      break;
    }
    case 'by-project': {
      const headers = ['Project', 'Findings', 'Patterns'];
      const rows = result.rows.map((r) => [
        String(r.project ?? ''),
        String(r.finding_count ?? 0),
        String(r.pattern_count ?? 0),
      ]);
      console.log(formatTable(rows, headers));
      break;
    }
  }
}

export function parseReportArgs(args: string[]): ReportOptions {
  const options: ReportOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--by-model':
        options.byModel = true;
        break;
      case '--by-project':
        options.byProject = true;
        break;
      case '--since':
        options.since = args[++i];
        break;
      case '--category':
        options.category = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
    }
  }
  return options;
}
