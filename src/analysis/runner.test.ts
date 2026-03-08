import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

import { ClaudeRunner } from './runner.js';
import type { AnalysisResponse } from './schema.js';

vi.mock('node:child_process');

// Valid response fixture matching AnalysisResponseSchema
const VALID_RESPONSE: AnalysisResponse = {
  findings: [
    {
      source: 'claude',
      session_id: 'sess-001',
      session_date: '2026-03-07',
      category: 'repeated_mistake',
      severity: 2,
      title: 'Repeated deprecated API usage',
      description: 'Agent used deprecated fs.readFileSync three times.',
      evidence: 'Line 42: fs.readFileSync(...)',
    },
  ],
};

const EMPTY_RESPONSE: AnalysisResponse = { findings: [] };

interface MockStdin extends EventEmitter {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

interface MockChildProcess extends EventEmitter {
  stdin: MockStdin;
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  pid: number;
}

function createMockProcess(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  const stdin = new EventEmitter() as MockStdin;
  stdin.write = vi.fn();
  stdin.end = vi.fn();
  proc.stdin = stdin;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.pid = 12345;
  return proc;
}

/** Simulate stdout data then process exit on next tick */
function emitStdoutAndExit(proc: MockChildProcess, data: string, exitCode = 0) {
  process.nextTick(() => {
    proc.stdout.emit('data', Buffer.from(data));
    proc.emit('close', exitCode);
  });
}

/** Simulate process exit with no stdout */
function emitExit(proc: MockChildProcess, exitCode: number) {
  process.nextTick(() => {
    proc.emit('close', exitCode);
  });
}

/** Simulate an error event (e.g. ENOENT) */
function emitError(proc: MockChildProcess, error: NodeJS.ErrnoException) {
  process.nextTick(() => {
    proc.emit('error', error);
  });
}

describe('ClaudeRunner', () => {
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const cp = await import('node:child_process');
    mockSpawn = vi.mocked(cp.spawn);
    mockSpawn.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor defaults', () => {
    it('uses default model when none specified', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('test input', 'system prompt');
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));

      return promise.then(() => {
        const spawnArgs = mockSpawn.mock.calls[0];
        expect(spawnArgs[1]).toContain('claude-sonnet-4-20250514');
      });
    });

    it('uses custom model when provided', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner({ model: 'claude-opus-4-20250514' });
      const promise = runner.run('test input', 'system prompt');
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));

      return promise.then(() => {
        const spawnArgs = mockSpawn.mock.calls[0];
        expect(spawnArgs[1]).toContain('claude-opus-4-20250514');
      });
    });

    it('uses custom timeout', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner({ timeoutMs: 1000 });
      // Don't emit anything -- let it timeout
      const promise = runner.run('test input', 'system prompt');

      await expect(promise).rejects.toThrow(/timeout/i);
      expect(proc.kill).toHaveBeenCalled();
    }, 5000);
  });

  describe('subprocess cleanup', () => {
    it('kills child process on SIGINT', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      // Save original SIGINT listeners
      const originalListeners = process.listeners('SIGINT');

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      // Emit SIGINT
      process.emit('SIGINT');

      // Resolve the process so the promise settles
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));
      await promise.catch(() => {}); // swallow any error

      expect(proc.kill).toHaveBeenCalled();

      // Restore original SIGINT listeners
      process.removeAllListeners('SIGINT');
      for (const listener of originalListeners) {
        process.on('SIGINT', listener as (...args: unknown[]) => void);
      }
    });
  });

  describe('spawn arguments', () => {
    it('spawns claude with correct arguments', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner({ model: 'claude-sonnet-4-20250514' });
      const systemPrompt = 'You are a drift analyzer.';
      const promise = runner.run('some input', systemPrompt);
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));

      return promise.then(() => {
        expect(mockSpawn).toHaveBeenCalledTimes(1);
        const [binary, args] = mockSpawn.mock.calls[0];
        expect(binary).toBe('claude');
        expect(args).toContain('--print');
        expect(args).toContain('--output-format');
        expect(args).toContain('json');
        expect(args).toContain('--model');
        expect(args).toContain('claude-sonnet-4-20250514');
        expect(args).toContain('--no-session-persistence');
        expect(args).toContain('--permission-mode');
        expect(args).toContain('bypassPermissions');
        expect(args).toContain('--system-prompt');
        expect(args).toContain(systemPrompt);
      });
    });

    it('pipes input to stdin', () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const input = 'Analyze this session transcript.';
      const promise = runner.run(input, 'system prompt');
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));

      return promise.then(() => {
        expect(proc.stdin.write).toHaveBeenCalledWith(input);
        expect(proc.stdin.end).toHaveBeenCalled();
      });
    });
  });

  describe('response parsing', () => {
    it('parses valid JSON response', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));

      const result = await promise;
      expect(result).toEqual(VALID_RESPONSE);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].category).toBe('repeated_mistake');
    });

    it('returns empty findings for valid empty response', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');
      emitStdoutAndExit(proc, JSON.stringify(EMPTY_RESPONSE));

      const result = await promise;
      expect(result).toEqual(EMPTY_RESPONSE);
      expect(result.findings).toHaveLength(0);
    });

    it('unwraps claude --output-format json envelope', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      // Simulate envelope: { type: "result", result: "<json string>" }
      const envelope = JSON.stringify({
        type: 'result',
        subtype: 'success',
        result: JSON.stringify(VALID_RESPONSE),
        session_id: 'test-session',
        cost_usd: 0.01,
      });
      emitStdoutAndExit(proc, envelope);

      const result = await promise;
      expect(result).toEqual(VALID_RESPONSE);
    });

    it('handles direct JSON response without envelope', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');
      emitStdoutAndExit(proc, JSON.stringify(VALID_RESPONSE));

      const result = await promise;
      expect(result).toEqual(VALID_RESPONSE);
    });
  });

  describe('error handling', () => {
    it('throws on non-zero exit code', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');
      emitExit(proc, 1);

      await expect(promise).rejects.toThrow(/exit code/i);
    });

    it('retries once on invalid JSON then succeeds', async () => {
      const proc1 = createMockProcess();
      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      // First call: invalid JSON
      emitStdoutAndExit(proc1, 'not valid json {{{');

      // Second call (retry): valid JSON
      // Need to wait a tick for the retry spawn to happen
      setTimeout(() => {
        emitStdoutAndExit(proc2, JSON.stringify(VALID_RESPONSE));
      }, 50);

      const result = await promise;
      expect(result).toEqual(VALID_RESPONSE);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('throws after retry on persistent invalid JSON', async () => {
      const proc1 = createMockProcess();
      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      // First call: invalid JSON
      emitStdoutAndExit(proc1, 'garbage output');

      // Second call (retry): still invalid JSON
      setTimeout(() => {
        emitStdoutAndExit(proc2, 'still garbage');
      }, 50);

      await expect(promise).rejects.toThrow(/json/i);
    });

    it('throws on timeout and kills the process', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner({ timeoutMs: 100 });
      const promise = runner.run('input', 'prompt');

      // Don't emit any events -- let it timeout

      await expect(promise).rejects.toThrow(/timeout/i);
      expect(proc.kill).toHaveBeenCalled();
    }, 5000);

    it('retries once on valid JSON that fails zod validation', async () => {
      const proc1 = createMockProcess();
      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      // Valid JSON but missing required fields
      emitStdoutAndExit(proc1, JSON.stringify({ wrong_key: true }));

      setTimeout(() => {
        emitStdoutAndExit(proc2, JSON.stringify(VALID_RESPONSE));
      }, 50);

      const result = await promise;
      expect(result).toEqual(VALID_RESPONSE);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
    });

    it('throws on non-ENOENT spawn error', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      const err = new Error('spawn claude EACCES') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      emitError(proc, err);

      await expect(promise).rejects.toThrow(/EACCES/);
    });

    it('includes stderr in exit code error', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      process.nextTick(() => {
        proc.stderr.emit('data', Buffer.from('Something went wrong'));
        proc.emit('close', 1);
      });

      await expect(promise).rejects.toThrow(/something went wrong/i);
    });

    it('throws descriptive error when claude not found', async () => {
      const proc = createMockProcess();
      mockSpawn.mockReturnValue(proc);

      const runner = new ClaudeRunner();
      const promise = runner.run('input', 'prompt');

      const err = new Error('spawn claude ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      emitError(proc, err);

      await expect(promise).rejects.toThrow(/claude.*not found|ENOENT|not installed/i);
    });
  });
});
