import { spawn } from 'node:child_process';
import type { z } from 'zod';
import { AnalysisResponseSchema, type AnalysisResponse } from './schema.js';

export interface RunnerOptions {
  model?: string;
  timeoutMs?: number;
}

export class ClaudeRunner {
  private static activeProcesses = new Set<import('node:child_process').ChildProcess>();
  private static signalHandlersInstalled = false;
  private static _shuttingDown = false;

  static get shuttingDown(): boolean {
    return ClaudeRunner._shuttingDown;
  }

  private static installSignalHandlers(): void {
    if (ClaudeRunner.signalHandlersInstalled) return;
    ClaudeRunner.signalHandlersInstalled = true;

    const cleanup = () => {
      ClaudeRunner._shuttingDown = true;
      for (const proc of ClaudeRunner.activeProcesses) {
        proc.kill();
      }
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  private model: string;
  private timeoutMs: number;

  constructor(options?: RunnerOptions) {
    this.model = options?.model ?? 'claude-sonnet-4-20250514';
    this.timeoutMs = options?.timeoutMs ?? 300_000;
  }

  async run(input: string, systemPrompt: string): Promise<AnalysisResponse> {
    return this.execGeneric(input, systemPrompt, AnalysisResponseSchema, true);
  }

  async runWithSchema<T>(input: string, systemPrompt: string, schema: z.ZodType<T>): Promise<T> {
    return this.execGeneric(input, systemPrompt, schema, true);
  }

  private execGeneric<T>(
    input: string,
    systemPrompt: string,
    schema: z.ZodType<T>,
    canRetry: boolean,
    deadline?: number,
  ): Promise<T> {
    const effectiveDeadline = deadline ?? Date.now() + this.timeoutMs;
    if (ClaudeRunner._shuttingDown) {
      return Promise.reject(new Error('Shutting down'));
    }
    const remaining = effectiveDeadline - Date.now();
    if (remaining <= 0) {
      return Promise.reject(new Error('Timeout budget exhausted'));
    }

    return new Promise<T>((resolve, reject) => {
      const args = [
        '--print',
        '--output-format',
        'json',
        '--model',
        this.model,
        '--no-session-persistence',
        '--permission-mode',
        'bypassPermissions',
        '--system-prompt',
        systemPrompt,
      ];

      const proc = spawn('claude', args);
      ClaudeRunner.installSignalHandlers();
      ClaudeRunner.activeProcesses.add(proc);

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          ClaudeRunner.activeProcesses.delete(proc);
          proc.kill();
          reject(new Error(`Process timeout after ${this.timeoutMs}ms`));
        }
      }, remaining);

      proc.stdin.on('error', () => {
        // Ignore EPIPE - process may have exited before reading all input
      });

      proc.stdin.write(input);
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        ClaudeRunner.activeProcesses.delete(proc);
        clearTimeout(timer);
        if (err.code === 'ENOENT') {
          reject(new Error('claude CLI not found (ENOENT). Is it installed?'));
        } else {
          reject(err);
        }
      });

      proc.on('close', (exitCode: number) => {
        if (settled) return;
        settled = true;
        ClaudeRunner.activeProcesses.delete(proc);
        clearTimeout(timer);

        if (exitCode !== 0) {
          const detail = stderr ? `: ${stderr.slice(0, 500)}` : '';
          reject(new Error(`Process exited with exit code ${exitCode}${detail}`));
          return;
        }

        try {
          let parsed = JSON.parse(stdout);
          // Unwrap claude --output-format json envelope
          if (parsed && typeof parsed.result === 'string' && parsed.type === 'result') {
            let raw = parsed.result;
            // Strip markdown code fences if present (e.g. ```json\n{...}\n```)
            const fenceMatch = raw.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
            if (fenceMatch) {
              raw = fenceMatch[1].trim();
            }
            parsed = JSON.parse(raw);
          }
          const validated = schema.parse(parsed);
          resolve(validated);
        } catch {
          if (canRetry) {
            this.execGeneric(input, systemPrompt, schema, false, effectiveDeadline).then(
              resolve,
              reject,
            );
          } else {
            reject(new Error(`Failed to parse JSON response: ${stdout.slice(0, 500)}`));
          }
        }
      });
    });
  }
}
