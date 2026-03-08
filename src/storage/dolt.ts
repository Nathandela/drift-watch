import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const PORT_BASE = 14307;
const PORT_RANGE = 1000;

export function fnvHash(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function derivePort(dataDir: string): number {
  return PORT_BASE + (fnvHash(dataDir) % PORT_RANGE);
}

export class DoltServer {
  readonly dataDir: string;
  readonly port: number;
  private pidFile: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.port = derivePort(dataDir);
    this.pidFile = path.join(dataDir, 'dolt-server.pid');
  }

  async isRunning(): Promise<boolean> {
    const pid = this.readPid();
    if (pid === null) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      this.removePidFile();
      return false;
    }
  }

  async start(): Promise<void> {
    if (await this.isRunning()) return;

    const doltDir = path.join(this.dataDir, 'dolt');
    const child = spawn(
      'dolt',
      ['sql-server', '--port', String(this.port), '--host', '127.0.0.1'],
      {
        cwd: doltDir,
        detached: true,
        stdio: 'ignore',
      },
    );

    child.unref();

    if (child.pid) {
      fs.writeFileSync(this.pidFile, String(child.pid));
    }

    await this.waitForReady();
  }

  async stop(): Promise<void> {
    const pid = this.readPid();
    if (pid === null) return;
    try {
      // Verify it's a Dolt process before killing
      const { execFileSync } = await import('node:child_process');
      try {
        const cmdline = execFileSync('ps', ['-p', String(pid), '-o', 'comm='], {
          encoding: 'utf-8',
        }).trim();
        if (!cmdline.includes('dolt')) {
          this.removePidFile();
          return;
        }
      } catch {
        // ps failed, process probably gone
        this.removePidFile();
        return;
      }
      process.kill(pid, 'SIGTERM');
    } catch {
      // process already gone
    }
    this.removePidFile();
  }

  async ensureRunning(): Promise<void> {
    if (!(await this.isRunning())) {
      await this.start();
    }
  }

  async connect(): Promise<mysql.Connection> {
    await this.ensureRunning();
    return mysql.createConnection({
      host: '127.0.0.1',
      port: this.port,
      user: 'root',
      database: 'drift_watch',
    });
  }

  private readPid(): number | null {
    try {
      const content = fs.readFileSync(this.pidFile, 'utf-8').trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  private removePidFile(): void {
    try {
      fs.unlinkSync(this.pidFile);
    } catch {
      // already gone
    }
  }

  private async waitForReady(timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Check if process died
      if (!(await this.isRunning())) {
        throw new Error('Dolt server process exited unexpectedly');
      }
      try {
        const conn = await mysql.createConnection({
          host: '127.0.0.1',
          port: this.port,
          user: 'root',
          connectTimeout: 1000,
        });
        await conn.end();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error(`Dolt server failed to start within ${timeoutMs}ms on port ${this.port}`);
  }
}
