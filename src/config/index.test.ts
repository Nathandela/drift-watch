import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  readConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
  printConfig,
  DEFAULT_CONFIG,
  type DriftWatchConfig,
} from './index.js';

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-watch-config-test-'));
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG).toEqual({
      scan_interval: '0 3 * * 0',
      claude_model: 'sonnet',
      categories: ['all'],
      excluded_projects: [],
      dolt_port: null,
    });
  });
});

describe('readConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = readConfig(testDir);

    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults when config.json is empty object', () => {
    fs.writeFileSync(path.join(testDir, 'config.json'), '{}');

    const config = readConfig(testDir);

    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('merges file values with defaults', () => {
    fs.writeFileSync(
      path.join(testDir, 'config.json'),
      JSON.stringify({ claude_model: 'opus', dolt_port: 3307 }),
    );

    const config = readConfig(testDir);

    expect(config.claude_model).toBe('opus');
    expect(config.dolt_port).toBe(3307);
    // Unset fields keep defaults
    expect(config.scan_interval).toBe('0 3 * * 0');
    expect(config.categories).toEqual(['all']);
    expect(config.excluded_projects).toEqual([]);
  });

  it('file values override all default fields', () => {
    const custom: DriftWatchConfig = {
      scan_interval: '0 0 * * *',
      claude_model: 'haiku',
      categories: ['repeated_mistake', 'drift'],
      excluded_projects: ['/tmp/skip-this'],
      dolt_port: 5555,
    };
    fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify(custom));

    const config = readConfig(testDir);

    expect(config).toEqual(custom);
  });

  it('uses default data dir when no argument provided', () => {
    // Should not throw -- it reads from ~/.drift-watch/config.json
    // which may or may not exist, but should return valid config either way
    const config = readConfig();

    expect(config).toHaveProperty('scan_interval');
    expect(config).toHaveProperty('claude_model');
    expect(config).toHaveProperty('categories');
    expect(config).toHaveProperty('excluded_projects');
    expect(config).toHaveProperty('dolt_port');
  });
});

describe('writeConfig', () => {
  it('creates config.json with provided values merged with defaults', () => {
    writeConfig({ claude_model: 'opus' }, testDir);

    const raw = JSON.parse(fs.readFileSync(path.join(testDir, 'config.json'), 'utf-8'));
    expect(raw.claude_model).toBe('opus');
    // Defaults should be present in the written file
    expect(raw.scan_interval).toBe('0 3 * * 0');
  });

  it('merges with existing config on disk', () => {
    fs.writeFileSync(
      path.join(testDir, 'config.json'),
      JSON.stringify({ claude_model: 'opus', dolt_port: 3307 }),
    );

    writeConfig({ categories: ['drift'] }, testDir);

    const raw = JSON.parse(fs.readFileSync(path.join(testDir, 'config.json'), 'utf-8'));
    expect(raw.claude_model).toBe('opus');
    expect(raw.dolt_port).toBe(3307);
    expect(raw.categories).toEqual(['drift']);
  });

  it('overwrites existing field values', () => {
    writeConfig({ claude_model: 'opus' }, testDir);
    writeConfig({ claude_model: 'haiku' }, testDir);

    const raw = JSON.parse(fs.readFileSync(path.join(testDir, 'config.json'), 'utf-8'));
    expect(raw.claude_model).toBe('haiku');
  });

  it('creates data directory if it does not exist', () => {
    const nestedDir = path.join(testDir, 'nested', 'deep');

    writeConfig({ claude_model: 'opus' }, nestedDir);

    expect(fs.existsSync(path.join(nestedDir, 'config.json'))).toBe(true);
  });
});

describe('getConfigValue', () => {
  it('returns value for an existing key', () => {
    fs.writeFileSync(path.join(testDir, 'config.json'), JSON.stringify({ claude_model: 'opus' }));

    expect(getConfigValue('claude_model', testDir)).toBe('opus');
  });

  it('returns default value when key is not in file', () => {
    fs.writeFileSync(path.join(testDir, 'config.json'), '{}');

    expect(getConfigValue('scan_interval', testDir)).toBe('0 3 * * 0');
  });

  it('returns default value when no file exists', () => {
    expect(getConfigValue('claude_model', testDir)).toBe('sonnet');
  });

  it('returns array values', () => {
    fs.writeFileSync(
      path.join(testDir, 'config.json'),
      JSON.stringify({ categories: ['drift', 'repeated_mistake'] }),
    );

    expect(getConfigValue('categories', testDir)).toEqual(['drift', 'repeated_mistake']);
  });

  it('returns null for dolt_port default', () => {
    expect(getConfigValue('dolt_port', testDir)).toBeNull();
  });
});

describe('setConfigValue', () => {
  it('sets a string value', () => {
    setConfigValue('claude_model', 'opus', testDir);

    const config = readConfig(testDir);
    expect(config.claude_model).toBe('opus');
  });

  it('sets a numeric value by parsing the string', () => {
    setConfigValue('dolt_port', '3307', testDir);

    const config = readConfig(testDir);
    expect(config.dolt_port).toBe(3307);
  });

  it('sets null when value is "null"', () => {
    // First set a port, then clear it
    setConfigValue('dolt_port', '3307', testDir);
    setConfigValue('dolt_port', 'null', testDir);

    const config = readConfig(testDir);
    expect(config.dolt_port).toBeNull();
  });

  it('sets an array value from comma-separated string', () => {
    setConfigValue('categories', 'drift,repeated_mistake,tool_failure', testDir);

    const config = readConfig(testDir);
    expect(config.categories).toEqual(['drift', 'repeated_mistake', 'tool_failure']);
  });

  it('sets a single-element array from non-comma string for array fields', () => {
    setConfigValue('categories', 'drift', testDir);

    const config = readConfig(testDir);
    expect(config.categories).toEqual(['drift']);
  });

  it('trims whitespace from comma-separated array elements', () => {
    setConfigValue('categories', 'drift , repeated_mistake , tool_failure', testDir);

    const config = readConfig(testDir);
    expect(config.categories).toEqual(['drift', 'repeated_mistake', 'tool_failure']);
  });

  it('handles excluded_projects as array field', () => {
    setConfigValue('excluded_projects', '/tmp/a,/tmp/b', testDir);

    const config = readConfig(testDir);
    expect(config.excluded_projects).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('preserves other config values when setting one', () => {
    writeConfig({ claude_model: 'opus', dolt_port: 3307 }, testDir);

    setConfigValue('scan_interval', '0 0 * * *', testDir);

    const config = readConfig(testDir);
    expect(config.claude_model).toBe('opus');
    expect(config.dolt_port).toBe(3307);
    expect(config.scan_interval).toBe('0 0 * * *');
  });

  it('sets a plain string for non-array, non-numeric fields', () => {
    setConfigValue('scan_interval', '*/5 * * * *', testDir);

    const config = readConfig(testDir);
    expect(config.scan_interval).toBe('*/5 * * * *');
  });
});

describe('printConfig', () => {
  it('prints all config fields to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printConfig(DEFAULT_CONFIG);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('scan_interval');
    expect(output).toContain('0 3 * * 0');
    expect(output).toContain('claude_model');
    expect(output).toContain('sonnet');
    expect(output).toContain('categories');
    expect(output).toContain('all');
    expect(output).toContain('excluded_projects');
    expect(output).toContain('dolt_port');

    consoleSpy.mockRestore();
  });

  it('prints custom config values', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const custom: DriftWatchConfig = {
      scan_interval: '0 0 * * *',
      claude_model: 'opus',
      categories: ['drift', 'repeated_mistake'],
      excluded_projects: ['/tmp/skip'],
      dolt_port: 5555,
    };
    printConfig(custom);

    const output = consoleSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output).toContain('opus');
    expect(output).toContain('5555');
    expect(output).toContain('drift');
    expect(output).toContain('/tmp/skip');

    consoleSpy.mockRestore();
  });
});
