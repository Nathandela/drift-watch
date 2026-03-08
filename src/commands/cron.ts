import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DATA_DIR } from '../config/index.js';

export interface CronResult {
  installed: boolean;
  interval?: string;
}

export interface CronStatusResult {
  installed: boolean;
  interval?: string;
  lastRun?: string;
}

export function parseCronArgs(args: string[]): { subcommand?: string; interval?: string } {
  let subcommand: string | undefined;
  let interval: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--interval') {
      interval = args[++i];
    } else if (!args[i].startsWith('-')) {
      subcommand = args[i];
    }
  }

  return { subcommand, interval };
}

const CRON_FIELD = /^[\d*,/-]+$/;

function validateCronInterval(interval: string): void {
  const fields = interval.split(/\s+/);
  if (fields.length !== 5 || !fields.every((f) => CRON_FIELD.test(f))) {
    throw new Error(
      `Invalid cron expression: "${interval}". Expected 5 fields (e.g., "0 3 * * 0").`,
    );
  }
}

function getCurrentCrontab(): string {
  try {
    const buf = execFileSync('crontab', ['-l']);
    return buf.toString();
  } catch {
    return '';
  }
}

function writeCrontab(content: string): void {
  execFileSync('crontab', ['-'], { input: content });
}

function filterDriftWatchLines(crontab: string): string[] {
  return crontab.split('\n').filter((line) => line && !/drift-watch\s+scan\b/.test(line));
}

export async function cronInstall(options?: {
  interval?: string;
  dataDir?: string;
}): Promise<CronResult> {
  const interval = options?.interval ?? '0 3 * * 0';
  validateCronInterval(interval);
  const dataDir = options?.dataDir ?? DEFAULT_DATA_DIR;
  const logsDir = path.join(dataDir, 'logs');

  let binaryPath = 'drift-watch';
  try {
    binaryPath = execFileSync('which', ['drift-watch'], { encoding: 'utf-8' }).trim();
  } catch {
    // Fall back to relative name if which fails
  }

  const current = getCurrentCrontab();
  const lines = filterDriftWatchLines(current);

  const entry = `${interval} "${binaryPath}" scan >> "${logsDir}/$(date +\\%Y-\\%m-\\%d).log" 2>&1`;
  lines.push(entry);

  writeCrontab(lines.join('\n') + '\n');
  fs.mkdirSync(logsDir, { recursive: true });

  return { installed: true, interval };
}

export async function cronRemove(_dataDir?: string): Promise<CronResult> {
  const current = getCurrentCrontab();
  const lines = filterDriftWatchLines(current);

  writeCrontab(lines.length ? lines.join('\n') + '\n' : '');

  return { installed: false };
}

export async function cronStatus(dataDir?: string): Promise<CronStatusResult> {
  const dir = dataDir ?? DEFAULT_DATA_DIR;
  const logsDir = path.join(dir, 'logs');

  const current = getCurrentCrontab();
  const dwLine = current.split('\n').find((line) => /drift-watch\s+scan\b/.test(line));

  let installed = false;
  let interval: string | undefined;

  if (dwLine) {
    installed = true;
    // Extract the cron interval (first 5 fields)
    const parts = dwLine.trim().split(/\s+/);
    interval = parts.slice(0, 5).join(' ');
  }

  let lastRun: string | undefined;
  try {
    const files = fs.readdirSync(logsDir) as string[];
    const logFiles = files
      .filter((f: string) => f.endsWith('.log'))
      .map((f: string) => f.replace('.log', ''))
      .sort();
    if (logFiles.length) {
      lastRun = logFiles[logFiles.length - 1];
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  return { installed, interval, lastRun };
}

export function printCronResult(result: CronResult | CronStatusResult): void {
  if (result.installed && result.interval) {
    console.log(`Cron installed: ${result.interval}`);
    if ('lastRun' in result && result.lastRun) {
      console.log(`Last run: ${result.lastRun}`);
    }
  } else {
    console.log('Cron removed (not installed)');
  }
}
