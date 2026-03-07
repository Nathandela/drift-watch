import { DoltServer } from '../storage/dolt.js';
import { applyMigrations } from '../storage/migrations.js';
import { Repository } from '../storage/repository.js';
import { discoverConversations } from '../readers/index.js';
import { analyze } from '../analysis/index.js';
import { matchOrCreatePattern } from '../storage/patterns.js';
import { DEFAULT_DATA_DIR } from './config.js';
import type { NormalizedConversation } from '../readers/types.js';

export interface ScanResult {
  sessionsScanned: number;
  findingsCount: number;
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

export async function scan(dataDir = DEFAULT_DATA_DIR): Promise<ScanResult> {
  const server = new DoltServer(dataDir);
  const conn = await server.connect();
  await applyMigrations(conn);
  const repo = new Repository(conn);

  try {
    // Read cursors from last completed scan
    const cursors = await repo.getLatestCursors();
    const since = cursors?.lastScanTime ? new Date(cursors.lastScanTime) : undefined;

    // Discover new conversations
    const conversations = await discoverConversations({ since });

    if (conversations.length === 0) {
      return { sessionsScanned: 0, findingsCount: 0 };
    }

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

    // Group by project and analyze in batches
    const groups = groupByProject(conversations);
    let totalFindings = 0;

    try {
      for (const [, batch] of groups) {
        const findings = await analyze(batch);

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
          });

          await matchOrCreatePattern(repo, finding, findingId);
        }

        totalFindings += findings.length;
      }
    } catch (err) {
      await repo.updateScan(scanId, {
        finished_at: new Date(),
        status: 'failed',
        sessions_scanned: conversations.length,
        findings_count: totalFindings,
      });
      await repo.doltCommit(`scan: failed after ${totalFindings} finding(s)`);
      throw err;
    }

    // Update scan record with cursor based on scan start time
    const newCursors = { lastScanTime: startedAt.toISOString() };
    await repo.updateScan(scanId, {
      finished_at: new Date(),
      status: 'completed',
      sessions_scanned: conversations.length,
      findings_count: totalFindings,
      cursor_json: JSON.stringify(newCursors),
    });

    // Always commit to persist scan record and cursor
    await repo.doltCommit(
      `scan: ${totalFindings} finding(s) from ${conversations.length} session(s)`,
    );

    return {
      sessionsScanned: conversations.length,
      findingsCount: totalFindings,
    };
  } finally {
    await conn.end();
  }
}
