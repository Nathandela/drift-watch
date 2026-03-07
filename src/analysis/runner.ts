import { spawn } from 'node:child_process';
import { AnalysisResponseSchema, type AnalysisResponse } from './schema.js';

export interface RunnerOptions {
  model?: string;
  timeoutMs?: number;
}

export class ClaudeRunner {
  private model: string;
  private timeoutMs: number;

  constructor(options?: RunnerOptions) {
    this.model = options?.model ?? 'claude-sonnet-4-20250514';
    this.timeoutMs = options?.timeoutMs ?? 300_000;
  }

  async run(input: string, systemPrompt: string): Promise<AnalysisResponse> {
    return this.exec(input, systemPrompt, true);
  }

  private exec(input: string, systemPrompt: string, canRetry: boolean): Promise<AnalysisResponse> {
    return new Promise<AnalysisResponse>((resolve, reject) => {
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

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          proc.kill();
          reject(new Error(`Process timeout after ${this.timeoutMs}ms`));
        }
      }, this.timeoutMs);

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
        clearTimeout(timer);

        if (exitCode !== 0) {
          const detail = stderr ? `: ${stderr.slice(0, 500)}` : '';
          reject(new Error(`Process exited with exit code ${exitCode}${detail}`));
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          const validated = AnalysisResponseSchema.parse(parsed);
          resolve(validated);
        } catch {
          if (canRetry) {
            this.exec(input, systemPrompt, false).then(resolve, reject);
          } else {
            reject(new Error(`Failed to parse JSON response: ${stdout.slice(0, 200)}`));
          }
        }
      });
    });
  }
}
