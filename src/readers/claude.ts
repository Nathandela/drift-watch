import type { NormalizedConversation, NormalizedMessage, NormalizedToolUse } from './types.js';

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

type MessageContent = string | ContentBlock[] | undefined;

interface ClaudeLine {
  type?: string;
  message?: {
    role?: string;
    model?: string;
    content?: MessageContent;
  };
  timestamp?: string;
  cwd?: string;
  sessionId?: string;
}

function extractTextContent(content: MessageContent): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text as string)
    .join('\n');
}

function isToolResultContent(content: MessageContent): boolean {
  if (!Array.isArray(content)) return false;
  return content.length > 0 && content.every((c) => c.type === 'tool_result');
}

export function readClaudeSession(
  content: string,
  sessionId: string,
  project?: string,
): NormalizedConversation {
  const messages: NormalizedMessage[] = [];
  const toolUses: NormalizedToolUse[] = [];
  let model: string | undefined;
  let sessionDate: string | undefined;
  let cwd: string | undefined;

  const lines = content.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    let parsed: ClaudeLine;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!parsed.type || (parsed.type !== 'user' && parsed.type !== 'assistant')) continue;
    if (!sessionDate && parsed.timestamp) sessionDate = parsed.timestamp;
    if (!cwd && parsed.cwd) cwd = parsed.cwd;

    const msg = parsed.message;
    if (!msg) continue;

    if (parsed.type === 'assistant') {
      if (msg.model && !model) model = msg.model;

      const text = extractTextContent(msg.content);
      if (text) {
        messages.push({ role: 'assistant', content: text, timestamp: parsed.timestamp });
      }

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use' && block.name) {
            toolUses.push({
              name: block.name,
              input: block.input,
              timestamp: parsed.timestamp,
            });
          }
        }
      }
    } else if (parsed.type === 'user') {
      if (isToolResultContent(msg.content)) continue;
      const text = typeof msg.content === 'string' ? msg.content : extractTextContent(msg.content);
      if (text) {
        messages.push({ role: 'user', content: text, timestamp: parsed.timestamp });
      }
    }
  }

  return {
    source: 'claude',
    model,
    project: cwd ?? project,
    sessionId,
    sessionDate: sessionDate ?? '',
    messages,
    toolUses,
  };
}
