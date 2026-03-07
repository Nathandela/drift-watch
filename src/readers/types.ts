export type ConversationSource = 'claude' | 'codex' | 'gemini';

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface NormalizedToolUse {
  name: string;
  input?: Record<string, unknown>;
  result?: string;
  timestamp?: string;
}

export interface NormalizedConversation {
  source: ConversationSource;
  model: string | undefined;
  project: string | undefined;
  sessionId: string;
  sessionDate: string;
  messages: NormalizedMessage[];
  toolUses: NormalizedToolUse[];
}
