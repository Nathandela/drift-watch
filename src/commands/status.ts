import { DoltServer } from '../storage/dolt.js';
import { Repository } from '../storage/repository.js';
import { DEFAULT_DATA_DIR } from '../config/index.js';

export interface StatusResult {
  serverRunning: boolean;
  port: number;
  tableCounts: Record<string, number>;
  lastScanAt: string | null;
  lastScanStatus: string | null;
}

export async function status(dataDir = DEFAULT_DATA_DIR): Promise<StatusResult> {
  const server = new DoltServer(dataDir);
  const running = await server.isRunning();

  if (!running) {
    return {
      serverRunning: false,
      port: server.port,
      tableCounts: {},
      lastScanAt: null,
      lastScanStatus: null,
    };
  }

  const conn = await server.connect();
  const repo = new Repository(conn);

  try {
    const tableCounts = await repo.getTableCounts();
    const lastScan = await repo.getLastScan();

    return {
      serverRunning: true,
      port: server.port,
      tableCounts,
      lastScanAt: lastScan?.started_at?.toISOString() ?? null,
      lastScanStatus: lastScan?.status ?? null,
    };
  } finally {
    await conn.end();
  }
}

export function printStatus(result: StatusResult): void {
  console.log(`Server: ${result.serverRunning ? 'running' : 'stopped'} (port ${result.port})`);

  if (!result.serverRunning) {
    console.log('Run "drift-watch init" to start the server.');
    return;
  }

  console.log('\nTable counts:');
  for (const [table, count] of Object.entries(result.tableCounts)) {
    console.log(`  ${table}: ${count}`);
  }

  if (result.lastScanAt) {
    console.log(`\nLast scan: ${result.lastScanAt} (${result.lastScanStatus})`);
  } else {
    console.log('\nNo scans yet.');
  }
}
