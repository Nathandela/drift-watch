import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { join, basename } from 'node:path';
import type { NormalizedConversation } from './types.js';
import { readClaudeSession } from './claude.js';
import { readCodexSession } from './codex.js';
import { readCodexThreadMetadata } from './codex-sqlite.js';
import { readGeminiSession } from './gemini.js';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export type { NormalizedConversation, NormalizedMessage, NormalizedToolUse } from './types.js';
export { readClaudeSession } from './claude.js';
export { readCodexSession } from './codex.js';
export { readCodexThreadMetadata, type CodexThreadMeta } from './codex-sqlite.js';
export { readGeminiSession } from './gemini.js';

export interface DiscoverOptions {
  claudeBase?: string;
  codexBase?: string;
  geminiBase?: string;
  since?: Date;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export interface DiscoverResult {
  conversations: NormalizedConversation[];
  maxMtime: Date | null;
}

interface FileEntry {
  path: string;
  mtime: Date;
  size: number;
}

async function findFiles(dir: string, pattern: RegExp, since?: Date): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findFiles(fullPath, pattern, since)));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        const s = await stat(fullPath);
        if (since && s.mtime <= since) continue;
        results.push({ path: fullPath, mtime: s.mtime, size: s.size });
      }
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      console.warn(`Warning: permission denied reading ${dir}`);
    }
    // ENOENT is expected for missing directories, ignore silently
  }
  return results;
}

async function discoverClaude(base: string, since?: Date): Promise<DiscoverResult> {
  const projectsDir = join(base, 'projects');
  if (!(await dirExists(projectsDir))) return { conversations: [], maxMtime: null };

  const fileEntries = await findFiles(projectsDir, /\.jsonl$/, since);
  const results: NormalizedConversation[] = [];
  let maxMtime: Date | null = null;

  for (const entry of fileEntries) {
    if (entry.path.includes('/subagents/')) continue;

    if (entry.size > MAX_FILE_SIZE) {
      console.warn(
        `Warning: skipping ${entry.path} (${Math.round(entry.size / 1024 / 1024)}MB exceeds 100MB limit)`,
      );
      continue;
    }

    if (!maxMtime || entry.mtime.getTime() > maxMtime.getTime()) maxMtime = entry.mtime;

    const content = await readFile(entry.path, 'utf-8');
    const sessionId = basename(entry.path, '.jsonl');

    results.push(readClaudeSession(content, sessionId));
  }

  return { conversations: results, maxMtime };
}

async function discoverCodex(base: string, since?: Date): Promise<DiscoverResult> {
  const sessionsDir = join(base, 'sessions');
  if (!(await dirExists(sessionsDir))) return { conversations: [], maxMtime: null };

  const fileEntries = await findFiles(sessionsDir, /\.jsonl$/, since);
  const results: NormalizedConversation[] = [];
  let maxMtime: Date | null = null;

  // Load SQLite metadata for enrichment
  const threadMeta = readCodexThreadMetadata(base, since);
  const metaByPath = new Map(threadMeta.map((t) => [t.rolloutPath, t]));

  for (const entry of fileEntries) {
    if (entry.size > MAX_FILE_SIZE) {
      console.warn(
        `Warning: skipping ${entry.path} (${Math.round(entry.size / 1024 / 1024)}MB exceeds 100MB limit)`,
      );
      continue;
    }

    if (!maxMtime || entry.mtime.getTime() > maxMtime.getTime()) maxMtime = entry.mtime;

    const content = await readFile(entry.path, 'utf-8');
    const conv = readCodexSession(content, basename(entry.path, '.jsonl'));

    // Enrich with SQLite metadata if available
    const meta = metaByPath.get(entry.path);
    if (meta) {
      if (!conv.project) conv.project = meta.cwd;
      if (!conv.model) conv.model = meta.modelProvider;
    }

    results.push(conv);
  }

  return { conversations: results, maxMtime };
}

async function discoverGemini(base: string, since?: Date): Promise<DiscoverResult> {
  const tmpDir = join(base, 'tmp');
  if (!(await dirExists(tmpDir))) return { conversations: [], maxMtime: null };

  const fileEntries = await findFiles(tmpDir, /^session-.*\.json$/, since);
  const results: NormalizedConversation[] = [];
  let maxMtime: Date | null = null;

  for (const entry of fileEntries) {
    if (entry.size > MAX_FILE_SIZE) {
      console.warn(
        `Warning: skipping ${entry.path} (${Math.round(entry.size / 1024 / 1024)}MB exceeds 100MB limit)`,
      );
      continue;
    }

    if (!maxMtime || entry.mtime.getTime() > maxMtime.getTime()) maxMtime = entry.mtime;

    const content = await readFile(entry.path, 'utf-8');
    results.push(readGeminiSession(content));
  }

  return { conversations: results, maxMtime };
}

const defaultHome = process.env.HOME ?? os.homedir();

export async function discoverConversations(
  options: DiscoverOptions = {},
): Promise<DiscoverResult> {
  const {
    claudeBase = join(defaultHome, '.claude'),
    codexBase = join(defaultHome, '.codex'),
    geminiBase = join(defaultHome, '.gemini'),
    since,
  } = options;

  const [claude, codex, gemini] = await Promise.all([
    discoverClaude(claudeBase, since),
    discoverCodex(codexBase, since),
    discoverGemini(geminiBase, since),
  ]);

  const conversations = [...claude.conversations, ...codex.conversations, ...gemini.conversations];

  const mtimes = [claude.maxMtime, codex.maxMtime, gemini.maxMtime].filter(
    (d): d is Date => d !== null,
  );
  const maxMtime = mtimes.length > 0 ? new Date(Math.max(...mtimes.map((d) => d.getTime()))) : null;

  return { conversations, maxMtime };
}
