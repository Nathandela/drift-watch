import { DoltServer } from '../storage/dolt.js';
import { applyMigrations } from '../storage/migrations.js';
import { Repository } from '../storage/repository.js';
import { discoverConversations } from '../readers/index.js';
import { analyze } from '../analysis/index.js';
import { ClaudeRunner } from '../analysis/runner.js';
import { matchOrCreatePattern } from '../storage/patterns.js';
import { DEFAULT_DATA_DIR, readConfig } from '../config/index.js';
import type { SessionProgress } from '../analysis/index.js';
import type { NormalizedConversation } from '../readers/types.js';

export interface ScanResult {
  sessionsScanned: number;
  findingsCount: number;
}

export type ScanProgress =
  | { phase: 'discovering' }
  | { phase: 'discovered'; totalSessions: number; projectCount: number; since?: Date }
  | { phase: 'session'; session: SessionProgress }
  | { phase: 'warning'; message: string }
  | { phase: 'committing' }
  | { phase: 'done'; result: ScanResult };

export interface ScanOptions {
  dataDir?: string;
  onProgress?: (progress: ScanProgress) => void;
}

function groupByProject(
  conversations: NormalizedConversation[],
): Map<string, NormalizedConversation[]> {
  const groups = new Map<string, NormalizedConversation[]>();
  for (const conv of conversations) {
    const key = conv.project ?? '_ungrouped';
    const list = groups.get(key) ?? [];
    list.push(conv);
    groups.set(key, list);
  }
  return groups;
}

export async function scan(optionsOrDataDir?: string | ScanOptions): Promise<ScanResult> {
  const opts: ScanOptions =
    typeof optionsOrDataDir === 'string' ? { dataDir: optionsOrDataDir } : (optionsOrDataDir ?? {});
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  const { onProgress } = opts;
  const emit = onProgress
    ? (progress: ScanProgress) => {
        try {
          onProgress(progress);
        } catch {
          // Never let a callback crash the scan pipeline
        }
      }
    : undefined;

  const config = readConfig(dataDir);
  const server = new DoltServer(dataDir);
  const conn = await server.connect();

  try {
    await applyMigrations(conn);
    const repo = new Repository(conn);
    // Read cursors from last completed scan
    const cursors = await repo.getLatestCursors();
    const since = cursors?.lastScanTime ? new Date(cursors.lastScanTime) : undefined;

    // Discover new conversations
    emit?.({ phase: 'discovering' });
    const { conversations, maxMtime } = await discoverConversations({ since });

    if (conversations.length === 0) {
      const result: ScanResult = { sessionsScanned: 0, findingsCount: 0 };
      emit?.({ phase: 'done', result });
      return result;
    }

    // Group by project and report discovery
    const groups = groupByProject(conversations);
    const totalSessions = conversations.length;
    emit?.({ phase: 'discovered', totalSessions, projectCount: groups.size, since });

    // Create scan record
    const startedAt = new Date();
    const scanId = await repo.insertScan({
      started_at: startedAt,
      finished_at: null,
      status: 'running',
      sessions_scanned: 0,
      findings_count: 0,
      cursor_json: null,
    });

    let totalFindings = 0;
    let sessionsProcessed = 0;
    let sessionOffset = 0;
    const errors: Array<{ project: string; error: Error }> = [];

    for (const [projectKey, batch] of groups) {
      if (ClaudeRunner.shuttingDown) break;
      try {
        const findings = await analyze(batch, {
          model: config.scan_model,
          onSessionComplete: emit ? (session) => emit({ phase: 'session', session }) : undefined,
          indexOffset: sessionOffset,
          globalTotal: totalSessions,
        });

        for (const finding of findings) {
          const findingId = await repo.insertFinding({
            scan_id: scanId,
            session_id: finding.session_id,
            source: finding.source,
            title: finding.title,
            description: finding.description,
            severity: String(finding.severity),
            model: finding.model ?? null,
            project: finding.project ?? null,
            evidence: finding.evidence ?? null,
            tool_context: finding.tool_context ?? null,
          });

          await matchOrCreatePattern(repo, finding, findingId);
        }

        totalFindings += findings.length;
        sessionsProcessed += batch.length;
      } catch (err) {
        // Emit session-level errors for each session in the failed group
        for (let i = 0; i < batch.length; i++) {
          emit?.({
            phase: 'session',
            session: {
              current: sessionOffset + i + 1,
              total: totalSessions,
              sessionId: batch[i].sessionId,
              project: batch[i].project,
              findingsCount: 0,
              status: 'error',
              error: (err as Error).message,
            },
          });
        }
        errors.push({ project: projectKey, error: err as Error });
      }
      sessionOffset += batch.length;
    }

    if (errors.length > 0 && totalFindings === 0) {
      // All groups failed - record failure and throw
      try {
        await repo.updateScan(scanId, {
          finished_at: new Date(),
          status: 'failed',
          sessions_scanned: sessionsProcessed,
          findings_count: totalFindings,
        });
        await repo.doltCommit(`scan: failed after ${totalFindings} finding(s)`);
      } catch {
        // Best-effort: don't mask the original analysis error
      }
      emit?.({ phase: 'done', result: { sessionsScanned: 0, findingsCount: 0 } });
      throw errors[0].error;
    }
    if (errors.length > 0) {
      emit?.({
        phase: 'warning',
        message: `${errors.length} project group(s) failed during scan`,
      });
    }
    if (ClaudeRunner.shuttingDown) {
      emit?.({ phase: 'warning', message: 'Scan interrupted by signal.' });
    }

    // Update scan record with cursor based on max file mtime
    const cursorTime = maxMtime ?? startedAt;
    const newCursors = { lastScanTime: cursorTime.toISOString() };
    const status = ClaudeRunner.shuttingDown
      ? 'interrupted'
      : errors.length > 0
        ? 'partial'
        : 'completed';

    emit?.({ phase: 'committing' });
    await repo.updateScan(scanId, {
      finished_at: new Date(),
      status,
      sessions_scanned: sessionsProcessed,
      findings_count: totalFindings,
      cursor_json: JSON.stringify(newCursors),
    });

    // Always commit to persist scan record and cursor
    await repo.doltCommit(`scan: ${totalFindings} finding(s) from ${sessionsProcessed} session(s)`);

    const result: ScanResult = {
      sessionsScanned: sessionsProcessed,
      findingsCount: totalFindings,
    };
    emit?.({ phase: 'done', result });
    return result;
  } finally {
    await conn.end();
  }
}
