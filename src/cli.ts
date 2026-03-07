#!/usr/bin/env node

import { init } from './commands/init.js';
import { status, printStatus } from './commands/status.js';
import { scan } from './commands/scan.js';
import { report, printReport, parseReportArgs } from './commands/report.js';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'init':
      await init();
      break;
    case 'status': {
      const result = await status();
      printStatus(result);
      break;
    }
    case 'scan': {
      const result = await scan();
      if (result.findingsCount === 0 && result.sessionsScanned === 0) {
        console.log('No new conversations to scan.');
      } else {
        console.log(
          `Scanned ${result.sessionsScanned} session(s), found ${result.findingsCount} finding(s).`,
        );
      }
      break;
    }
    case 'report': {
      const opts = parseReportArgs(process.argv.slice(3));
      const result = await report(opts);
      printReport(result);
      break;
    }
    default:
      console.log('Usage: drift-watch <init|status|scan|report>');
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
