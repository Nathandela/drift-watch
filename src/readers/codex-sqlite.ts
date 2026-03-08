import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export interface CodexThreadMeta {
  id: string;
  rolloutPath: string;
  cwd: string;
  modelProvider: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  gitBranch: string | null;
  gitOriginUrl: string | null;
  source: string;
}

interface SqliteRow {
  id: string;
  rollout_path: string;
  cwd: string;
  model_provider: string;
  title: string;
  created_at: number;
  updated_at: number;
  git_branch: string | null;
  git_origin_url: string | null;
  source: string;
}

/**
 * Read Codex thread metadata from the SQLite database.
 * Falls back to empty array if sqlite3 CLI or database is unavailable.
 */
export function readCodexThreadMetadata(codexBase: string, since?: Date): CodexThreadMeta[] {
  const dbCandidates = ['state_5.sqlite', 'state_4.sqlite', 'state.sqlite'];
  let dbPath: string | undefined;
  for (const candidate of dbCandidates) {
    const p = join(codexBase, candidate);
    if (existsSync(p)) {
      dbPath = p;
      break;
    }
  }
  if (!dbPath) return [];

  let whereClause = 'WHERE archived = 0';
  if (since) {
    const unixSince = Math.floor(since.getTime() / 1000);
    whereClause += ` AND updated_at >= ${unixSince}`;
  }

  const query = `SELECT id, rollout_path, cwd, model_provider, title, created_at, updated_at, git_branch, git_origin_url, source FROM threads ${whereClause} ORDER BY updated_at DESC`;

  try {
    const output = execFileSync('sqlite3', ['-json', dbPath, query], {
      encoding: 'utf-8',
      timeout: 5000,
    });

    const rows: SqliteRow[] = JSON.parse(output);
    return rows.map((row) => ({
      id: row.id,
      rolloutPath: row.rollout_path,
      cwd: row.cwd,
      modelProvider: row.model_provider,
      title: row.title,
      createdAt: new Date(row.created_at * 1000),
      updatedAt: new Date(row.updated_at * 1000),
      gitBranch: row.git_branch,
      gitOriginUrl: row.git_origin_url,
      source: row.source,
    }));
  } catch {
    return [];
  }
}
