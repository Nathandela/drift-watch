import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface DriftWatchConfig {
  scan_interval: string;
  claude_model: string;
  scan_model: string;
  suggest_model: string;
  categories: string[];
  excluded_projects: string[];
  dolt_port: number | null;
}

export const DEFAULT_CONFIG: DriftWatchConfig = {
  scan_interval: '0 3 * * 0',
  claude_model: 'sonnet',
  scan_model: 'haiku',
  suggest_model: 'claude-opus-4-6',
  categories: ['all'],
  excluded_projects: [],
  dolt_port: null,
};

const ARRAY_FIELDS: (keyof DriftWatchConfig)[] = ['categories', 'excluded_projects'];

function defaultDataDir(): string {
  return path.join(os.homedir(), '.drift-watch');
}

export const DEFAULT_DATA_DIR = defaultDataDir();

function configPath(dataDir: string): string {
  return path.join(dataDir, 'config.json');
}

export function readConfig(dataDir?: string): DriftWatchConfig {
  const dir = dataDir ?? defaultDataDir();
  const filePath = configPath(dir);

  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_CONFIG };
  }

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    console.warn(`Warning: could not parse ${filePath}, using defaults`);
    return { ...DEFAULT_CONFIG };
  }
  const validKeys = new Set(Object.keys(DEFAULT_CONFIG));
  const filtered = Object.fromEntries(Object.entries(raw).filter(([k]) => validKeys.has(k)));
  const merged = { ...DEFAULT_CONFIG, ...filtered };

  // Backward compat: if scan_model/suggest_model weren't explicitly set,
  // fall back to claude_model (which the user may have configured before the split)
  if (!('scan_model' in raw) && 'claude_model' in raw) {
    merged.scan_model = merged.claude_model;
  }
  if (!('suggest_model' in raw) && 'claude_model' in raw) {
    merged.suggest_model = merged.claude_model;
  }

  return merged;
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

const VALID_KEYS = new Set(Object.keys(DEFAULT_CONFIG));

export function setConfigValue(key: string, value: string, dataDir?: string): void {
  if (!VALID_KEYS.has(key)) {
    throw new Error(`Unknown config key: "${key}". Valid keys: ${[...VALID_KEYS].join(', ')}`);
  }
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
