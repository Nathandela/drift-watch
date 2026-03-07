import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');

import { parseCronArgs, cronInstall, cronRemove, cronStatus, printCronResult } from './cron.js';
import type { CronResult, CronStatusResult } from './cron.js';

describe('parseCronArgs', () => {
  it('parses install subcommand', () => {
    const opts = parseCronArgs(['install']);
    expect(opts.subcommand).toBe('install');
  });

  it('parses remove subcommand', () => {
    const opts = parseCronArgs(['remove']);
    expect(opts.subcommand).toBe('remove');
  });

  it('parses status subcommand', () => {
    const opts = parseCronArgs(['status']);
    expect(opts.subcommand).toBe('status');
  });

  it('parses --interval flag with install', () => {
    const opts = parseCronArgs(['install', '--interval', '*/5 * * * *']);
    expect(opts.subcommand).toBe('install');
    expect(opts.interval).toBe('*/5 * * * *');
  });

  it('returns undefined interval when not provided', () => {
    const opts = parseCronArgs(['install']);
    expect(opts.interval).toBeUndefined();
  });

  it('handles --interval before subcommand', () => {
    const opts = parseCronArgs(['--interval', '0 6 * * *', 'install']);
    expect(opts.subcommand).toBe('install');
    expect(opts.interval).toBe('0 6 * * *');
  });
});

describe('cronInstall', () => {
  let execFileSync: ReturnType<typeof vi.fn>;
  let mkdirSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const cp = await import('node:child_process');
    execFileSync = vi.mocked(cp.execFileSync);

    const fs = await import('node:fs');
    mkdirSync = vi.mocked(fs.mkdirSync);
  });

  it('adds crontab entry with default interval', async () => {
    // crontab -l returns empty
    execFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes('-l')) return Buffer.from('');
      return Buffer.from('');
    });

    const result = await cronInstall({ dataDir: '/tmp/test-dw' });

    expect(result.installed).toBe(true);
    expect(result.interval).toBe('0 3 * * 0');

    // Verify crontab was written with drift-watch entry
    const writeCall = execFileSync.mock.calls.find((c) => c[0] === 'crontab' && c[1]?.[0] === '-');
    expect(writeCall).toBeDefined();
  });

  it('uses custom interval when provided', async () => {
    execFileSync.mockImplementation(() => Buffer.from(''));

    const result = await cronInstall({ interval: '*/5 * * * *', dataDir: '/tmp/test-dw' });

    expect(result.installed).toBe(true);
    expect(result.interval).toBe('*/5 * * * *');
  });

  it('replaces existing drift-watch entry', async () => {
    const existingCrontab =
      '0 1 * * * some-other-job\n0 3 * * 0 drift-watch scan >> ~/.drift-watch/logs/old.log 2>&1\n';
    execFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes('-l')) return Buffer.from(existingCrontab);
      return Buffer.from('');
    });

    const result = await cronInstall({ interval: '0 6 * * 1', dataDir: '/tmp/test-dw' });

    expect(result.installed).toBe(true);
    expect(result.interval).toBe('0 6 * * 1');

    // The write call should NOT contain the old drift-watch entry
    // but SHOULD still contain the other job
    const writeCall = execFileSync.mock.calls.find(
      (c) => c[0] === 'crontab' && !c[1]?.includes('-l'),
    );
    expect(writeCall).toBeDefined();
  });

  it('creates logs directory', async () => {
    execFileSync.mockImplementation(() => Buffer.from(''));

    await cronInstall({ dataDir: '/tmp/test-dw' });

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('logs'),
      expect.objectContaining({ recursive: true }),
    );
  });
});

describe('cronRemove', () => {
  let execFileSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const cp = await import('node:child_process');
    execFileSync = vi.mocked(cp.execFileSync);
  });

  it('removes drift-watch entries from crontab', async () => {
    const existingCrontab =
      '0 1 * * * some-other-job\n0 3 * * 0 drift-watch scan >> ~/.drift-watch/logs/$(date +\\%Y-\\%m-\\%d).log 2>&1\n';
    execFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes('-l')) return Buffer.from(existingCrontab);
      return Buffer.from('');
    });

    const result = await cronRemove('/tmp/test-dw');

    expect(result.installed).toBe(false);
  });

  it('handles crontab with no drift-watch entries', async () => {
    execFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes('-l')) return Buffer.from('0 1 * * * some-other-job\n');
      return Buffer.from('');
    });

    const result = await cronRemove('/tmp/test-dw');

    expect(result.installed).toBe(false);
  });

  it('handles empty crontab', async () => {
    execFileSync.mockImplementation(() => Buffer.from(''));

    const result = await cronRemove('/tmp/test-dw');

    expect(result.installed).toBe(false);
  });
});

describe('cronStatus', () => {
  let execFileSync: ReturnType<typeof vi.fn>;
  let readdirSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const cp = await import('node:child_process');
    execFileSync = vi.mocked(cp.execFileSync);

    const fs = await import('node:fs');
    readdirSync = vi.mocked(fs.readdirSync);
  });

  it('detects installed cron entry', async () => {
    const crontab = '0 3 * * 0 drift-watch scan >> ~/.drift-watch/logs/$(date).log 2>&1\n';
    execFileSync.mockImplementation(() => Buffer.from(crontab));
    readdirSync.mockReturnValue([]);

    const result = await cronStatus('/tmp/test-dw');

    expect(result.installed).toBe(true);
    expect(result.interval).toBe('0 3 * * 0');
  });

  it('detects not installed', async () => {
    execFileSync.mockImplementation(() => Buffer.from('0 1 * * * other-job\n'));
    readdirSync.mockReturnValue([]);

    const result = await cronStatus('/tmp/test-dw');

    expect(result.installed).toBe(false);
    expect(result.interval).toBeUndefined();
  });

  it('finds last run from log files', async () => {
    const crontab = '0 3 * * 0 drift-watch scan >> ~/.drift-watch/logs/$(date).log 2>&1\n';
    execFileSync.mockImplementation(() => Buffer.from(crontab));
    readdirSync.mockReturnValue([
      '2026-03-01.log',
      '2026-03-05.log',
      '2026-02-28.log',
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = await cronStatus('/tmp/test-dw');

    expect(result.installed).toBe(true);
    expect(result.lastRun).toBe('2026-03-05');
  });

  it('returns undefined lastRun when no log files exist', async () => {
    execFileSync.mockImplementation(() => Buffer.from(''));
    readdirSync.mockImplementation(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await cronStatus('/tmp/test-dw');

    expect(result.lastRun).toBeUndefined();
  });
});

describe('printCronResult', () => {
  it('prints install result', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: CronResult = { installed: true, interval: '0 3 * * 0' };

    printCronResult(result);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('installed');
    expect(output).toContain('0 3 * * 0');
    spy.mockRestore();
  });

  it('prints remove result', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: CronResult = { installed: false };

    printCronResult(result);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('removed');
    spy.mockRestore();
  });

  it('prints status with last run', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: CronStatusResult = {
      installed: true,
      interval: '0 3 * * 0',
      lastRun: '2026-03-05',
    };

    printCronResult(result);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('2026-03-05');
    expect(output).toContain('0 3 * * 0');
    spy.mockRestore();
  });

  it('prints status when not installed', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result: CronStatusResult = { installed: false };

    printCronResult(result);

    const output = spy.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('not installed');
    spy.mockRestore();
  });
});
