#!/usr/bin/env node

import { init } from './commands/init.js';
import { status, printStatus } from './commands/status.js';
import { scan } from './commands/scan.js';
import { report, printReport, parseReportArgs } from './commands/report.js';
import { suggest, printSuggestions, parseSuggestArgs } from './commands/suggest.js';
import { readConfig, printConfig, setConfigValue } from './config/index.js';
import {
  parseCronArgs,
  cronInstall,
  cronRemove,
  cronStatus,
  printCronResult,
} from './commands/cron.js';

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
    case 'suggest': {
      const suggestOpts = parseSuggestArgs(process.argv.slice(3));
      const suggestResult = await suggest(suggestOpts);
      printSuggestions(suggestResult);
      break;
    }
    case 'config': {
      const sub = process.argv[3];
      if (sub === 'show') {
        const config = readConfig();
        printConfig(config);
      } else if (sub === 'set') {
        const key = process.argv[4];
        const value = process.argv[5];
        if (!key || !value) {
          console.log('Usage: drift-watch config set <key> <value>');
          process.exit(1);
        }
        setConfigValue(key, value);
        console.log(`Set ${key} = ${value}`);
      } else {
        console.log('Usage: drift-watch config <show|set>');
        process.exit(1);
      }
      break;
    }
    case 'cron': {
      const cronOpts = parseCronArgs(process.argv.slice(3));
      switch (cronOpts.subcommand) {
        case 'install': {
          const result = await cronInstall({ interval: cronOpts.interval });
          printCronResult(result);
          break;
        }
        case 'remove': {
          const result = await cronRemove();
          printCronResult(result);
          break;
        }
        case 'status': {
          const result = await cronStatus();
          printCronResult(result);
          break;
        }
        default:
          console.log('Usage: drift-watch cron <install|remove|status>');
          process.exit(1);
      }
      break;
    }
    default:
      console.log('Usage: drift-watch <init|status|scan|report|suggest|config|cron>');
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
