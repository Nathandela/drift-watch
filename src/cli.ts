#!/usr/bin/env node

import { init } from './commands/init.js';
import { status, printStatus } from './commands/status.js';

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
    default:
      console.log('Usage: drift-watch <init|status>');
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
