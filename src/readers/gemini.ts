import type { NormalizedConversation, NormalizedMessage, NormalizedToolUse } from './types.js';

interface GeminiToolCall {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: Array<{ functionResponse?: { response?: unknown } }>;
  timestamp?: string;
}

interface GeminiMessage {
  id?: string;
  timestamp?: string;
  type?: string;
  model?: string;
  content?: string | Array<{ text?: string }>;
  toolCalls?: GeminiToolCall[];
}

interface GeminiSession {
  sessionId?: string;
  projectHash?: string;
  startTime?: string;
  messages?: GeminiMessage[];
}

function extractContent(content: GeminiMessage['content']): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => c.text ?? '')
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export function readGeminiSession(raw: string): NormalizedConversation {
  let session: GeminiSession;
  try {
    session = JSON.parse(raw);
  } catch {
    return {
      source: 'gemini',
      model: undefined,
      project: undefined,
      sessionId: '',
      sessionDate: '',
      messages: [],
      toolUses: [],
    };
  }

  const messages: NormalizedMessage[] = [];
  const toolUses: NormalizedToolUse[] = [];
  let model: string | undefined;

  for (const msg of session.messages ?? []) {
    if (msg.type === 'user') {
      const text = extractContent(msg.content);
      if (text) {
        messages.push({ role: 'user', content: text, timestamp: msg.timestamp });
      }
    } else if (msg.type === 'gemini') {
      if (msg.model && !model) model = msg.model;
      const text = extractContent(msg.content);
      if (text) {
        messages.push({ role: 'assistant', content: text, timestamp: msg.timestamp });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          const resultStr =
            tc.result?.[0]?.functionResponse?.response != null
              ? JSON.stringify(tc.result[0].functionResponse.response)
              : undefined;
          toolUses.push({
            name: tc.name ?? 'unknown',
            input: tc.args,
            result: resultStr,
            timestamp: tc.timestamp,
          });
        }
      }
    }
    // skip 'error' type messages
  }

  return {
    source: 'gemini',
    model,
    project: undefined,
    sessionId: session.sessionId ?? '',
    sessionDate: session.startTime ?? '',
    messages,
    toolUses,
  };
}
