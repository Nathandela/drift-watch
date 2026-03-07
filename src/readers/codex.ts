import type { NormalizedConversation, NormalizedMessage, NormalizedToolUse } from './types.js';

interface CodexRecord {
  timestamp?: string;
  type?: string;
  payload?: {
    id?: string;
    cwd?: string;
    model_provider?: string;
    timestamp?: string;
    type?: string;
    role?: string;
    name?: string;
    call_id?: string;
    arguments?: string;
    output?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
}

export function readCodexSession(content: string, filename: string): NormalizedConversation {
  const messages: NormalizedMessage[] = [];
  const toolUses: NormalizedToolUse[] = [];
  let sessionId = filename;
  let project: string | undefined;
  let model: string | undefined;
  let sessionDate: string | undefined;

  const pendingCalls = new Map<string, NormalizedToolUse>();

  const lines = content.split('\n').filter((l) => l.trim());

  for (const line of lines) {
    let parsed: CodexRecord;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    const { type, payload } = parsed;
    if (!type || !payload) continue;

    if (type === 'session_meta') {
      if (payload.id) sessionId = payload.id;
      if (payload.cwd) project = payload.cwd;
      if (payload.model_provider) model = payload.model_provider;
      if (payload.timestamp) sessionDate = payload.timestamp;
      continue;
    }

    if (type === 'response_item') {
      if (payload.type === 'message' && payload.content) {
        const text = payload.content
          .map((c) => c.text ?? '')
          .filter(Boolean)
          .join('\n');
        if (text) {
          // In Codex: developer = user prompt, user = model response
          const role = payload.role === 'developer' ? 'user' : 'assistant';
          messages.push({ role, content: text, timestamp: parsed.timestamp });
        }
      } else if (payload.type === 'function_call' && payload.name) {
        let input: Record<string, unknown> | undefined;
        if (payload.arguments) {
          try {
            input = JSON.parse(payload.arguments);
          } catch {
            input = { raw: payload.arguments };
          }
        }
        const toolUse: NormalizedToolUse = {
          name: payload.name,
          input,
          timestamp: parsed.timestamp,
        };
        if (payload.call_id) pendingCalls.set(payload.call_id, toolUse);
        toolUses.push(toolUse);
      } else if (payload.type === 'function_call_output' && payload.call_id) {
        const pending = pendingCalls.get(payload.call_id);
        if (pending) {
          pending.result = payload.output;
          pendingCalls.delete(payload.call_id);
        }
      }
    }
  }

  return {
    source: 'codex',
    model,
    project,
    sessionId,
    sessionDate: sessionDate ?? '',
    messages,
    toolUses,
  };
}
