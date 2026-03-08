import type { NormalizedConversation } from '../readers/types.js';
import type { Finding } from './schema.js';
import { ClaudeRunner } from './runner.js';
import { buildSystemPrompt } from './prompt.js';

export interface AnalyzeOptions {
  model?: string;
  timeoutMs?: number;
}

export async function analyze(
  conversations: NormalizedConversation[],
  options?: AnalyzeOptions,
): Promise<Finding[]> {
  const runner = new ClaudeRunner(options);
  const concurrency = Math.min(conversations.length, 3);
  const findings: Finding[] = [];
  const queue = [...conversations];

  const worker = async () => {
    while (queue.length > 0) {
      const conv = queue.shift();
      if (!conv) continue;
      try {
        const systemPrompt = buildSystemPrompt({ project: conv.project, source: conv.source });
        const response = await runner.run(JSON.stringify(conv), systemPrompt);
        findings.push(...response.findings);
      } catch (err) {
        console.warn(
          `Warning: analysis failed for session ${conv.sessionId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return findings;
}
