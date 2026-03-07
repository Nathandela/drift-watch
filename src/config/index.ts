import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DriftWatchConfig {
  scan_interval: string;
  claude_model: string;
  categories: string[];
  excluded_projects: string[];
  dolt_port: number | null;
}

export const DEFAULT_CONFIG: DriftWatchConfig = {
  scan_interval: '0 3 * * 0',
  claude_model: 'sonnet',
  categories: ['all'],
  excluded_projects: [],
  dolt_port: null,
};

const ARRAY_FIELDS: (keyof DriftWatchConfig)[] = ['categories', 'excluded_projects'];

function defaultDataDir(): string {
  return path.join(os.homedir(), '.drift-watch');
}

function configPath(dataDir: string): string {
  return path.join(dataDir, 'config.json');
}

export function readConfig(dataDir?: string): DriftWatchConfig {
  const dir = dataDir ?? defaultDataDir();
  const filePath = configPath(dir);

  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return { ...DEFAULT_CONFIG, ...raw };
}

export function writeConfig(config: Partial<DriftWatchConfig>, dataDir?: string): void {
  const dir = dataDir ?? defaultDataDir();
  fs.mkdirSync(dir, { recursive: true });

  const existing = readConfig(dir);
  const merged = { ...existing, ...config };

  fs.writeFileSync(configPath(dir), JSON.stringify(merged, null, 2));
}

export function getConfigValue(
  key: string,
  dataDir?: string,
): DriftWatchConfig[keyof DriftWatchConfig] {
  const config = readConfig(dataDir);
  return config[key as keyof DriftWatchConfig];
}

export function setConfigValue(key: string, value: string, dataDir?: string): void {
  let parsed: string | number | null | string[];

  if (value === 'null') {
    parsed = null;
  } else if (ARRAY_FIELDS.includes(key as keyof DriftWatchConfig)) {
    parsed = value.split(',').map((s) => s.trim());
  } else if (!isNaN(Number(value)) && value.trim() !== '') {
    parsed = Number(value);
  } else {
    parsed = value;
  }

  writeConfig({ [key]: parsed }, dataDir);
}

export function printConfig(config: DriftWatchConfig): void {
  for (const [key, value] of Object.entries(config)) {
    console.log(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
  }
}
