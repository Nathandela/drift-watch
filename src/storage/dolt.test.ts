import { describe, it, expect } from 'vitest';
import { fnvHash, derivePort, DoltServer } from './dolt.js';

describe('fnvHash', () => {
  it('returns a consistent 32-bit hash for a given string', () => {
    const hash1 = fnvHash('test');
    const hash2 = fnvHash('test');
    expect(hash1).toBe(hash2);
  });

  it('returns different hashes for different strings', () => {
    expect(fnvHash('foo')).not.toBe(fnvHash('bar'));
  });

  it('returns a positive number', () => {
    expect(fnvHash('anything')).toBeGreaterThanOrEqual(0);
  });
});

describe('derivePort', () => {
  it('returns a port in range 14307-15306', () => {
    const port = derivePort('/home/user/.drift-watch/');
    expect(port).toBeGreaterThanOrEqual(14307);
    expect(port).toBeLessThanOrEqual(15306);
  });

  it('returns consistent port for same path', () => {
    const p1 = derivePort('/some/path');
    const p2 = derivePort('/some/path');
    expect(p1).toBe(p2);
  });

  it('returns different ports for different paths', () => {
    const p1 = derivePort('/path/a');
    const p2 = derivePort('/path/b');
    expect(p1).not.toBe(p2);
  });
});

describe('DoltServer', () => {
  it('constructs with a data directory', () => {
    const server = new DoltServer('/tmp/test-dolt');
    expect(server).toBeInstanceOf(DoltServer);
  });

  it('derives port from data directory', () => {
    const server = new DoltServer('/tmp/test-dolt');
    expect(server.port).toBeGreaterThanOrEqual(14307);
    expect(server.port).toBeLessThanOrEqual(15306);
  });

  it('reports not running when no PID file exists', async () => {
    const server = new DoltServer('/tmp/nonexistent-dolt-test-' + Date.now());
    expect(await server.isRunning()).toBe(false);
  });
});
