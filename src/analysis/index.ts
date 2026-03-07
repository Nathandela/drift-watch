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
  const findings: Finding[] = [];

  for (const conv of conversations) {
    const systemPrompt = buildSystemPrompt({ project: conv.project, source: conv.source });
    const runner = new ClaudeRunner(options);
    const response = await runner.run(JSON.stringify(conv), systemPrompt);
    findings.push(...response.findings);
  }

  return findings;
}
