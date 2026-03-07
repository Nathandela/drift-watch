import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DoltServer } from '../storage/dolt.js';
import { applyMigrations } from '../storage/migrations.js';

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.drift-watch');

function checkCli(command: string, versionArg: string): string {
  try {
    return execSync(`${command} ${versionArg}`, { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error(`Required CLI not found: ${command}. Please install it first.`);
  }
}

export async function init(dataDir = DEFAULT_DATA_DIR): Promise<void> {
  // Check required CLIs
  const doltVersion = checkCli('dolt', 'version');
  console.log(`Found: ${doltVersion}`);

  const claudeVersion = checkCli('claude', '--version');
  console.log(`Found: Claude ${claudeVersion}`);

  // Create data directory
  const doltDir = path.join(dataDir, 'dolt');
  if (!fs.existsSync(doltDir)) {
    fs.mkdirSync(doltDir, { recursive: true });
    console.log(`Created ${doltDir}`);
  }

  // Initialize Dolt repo if needed
  if (!fs.existsSync(path.join(doltDir, '.dolt'))) {
    execSync('dolt init --name drift-watch --email drift-watch@local', { cwd: doltDir });
    execSync('dolt sql -q "CREATE DATABASE IF NOT EXISTS drift_watch"', { cwd: doltDir });
    console.log('Initialized Dolt repository');
  }

  // Start server and apply schema
  const server = new DoltServer(dataDir);
  const conn = await server.connect();
  await applyMigrations(conn);
  await conn.end();

  console.log(`Drift-watch initialized at ${dataDir}`);
  console.log(`Dolt server running on port ${server.port}`);
}
