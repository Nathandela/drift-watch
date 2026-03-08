import { readdir, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import { join, basename } from 'node:path';
import type { NormalizedConversation } from './types.js';
import { readClaudeSession } from './claude.js';
import { readCodexSession } from './codex.js';
import { readGeminiSession } from './gemini.js';

export type { NormalizedConversation, NormalizedMessage, NormalizedToolUse } from './types.js';
export { readClaudeSession } from './claude.js';
export { readCodexSession } from './codex.js';
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

async function findFiles(dir: string, pattern: RegExp, since?: Date): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findFiles(fullPath, pattern, since)));
      } else if (entry.isFile() && pattern.test(entry.name)) {
        if (since) {
          const s = await stat(fullPath);
          if (s.mtime <= since) continue;
        }
        results.push(fullPath);
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

async function discoverClaude(base: string, since?: Date): Promise<NormalizedConversation[]> {
  const projectsDir = join(base, 'projects');
  if (!(await dirExists(projectsDir))) return [];

  const files = await findFiles(projectsDir, /\.jsonl$/, since);
  const results: NormalizedConversation[] = [];

  for (const file of files) {
    // Skip subagent files
    if (file.includes('/subagents/')) continue;

    const content = await readFile(file, 'utf-8');
    const sessionId = basename(file, '.jsonl');
    // Project path is encoded in the parent directory name
    const parts = file.split('/');
    const projectsIdx = parts.indexOf('projects');
    const projectEncoded = projectsIdx >= 0 ? parts[projectsIdx + 1] : undefined;
    const project = projectEncoded?.replace(/-/g, '/') ?? undefined;

    results.push(readClaudeSession(content, sessionId, project ?? ''));
  }

  return results;
}

async function discoverCodex(base: string, since?: Date): Promise<NormalizedConversation[]> {
  const sessionsDir = join(base, 'sessions');
  if (!(await dirExists(sessionsDir))) return [];

  const files = await findFiles(sessionsDir, /\.jsonl$/, since);
  const results: NormalizedConversation[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    results.push(readCodexSession(content, basename(file, '.jsonl')));
  }

  return results;
}

async function discoverGemini(base: string, since?: Date): Promise<NormalizedConversation[]> {
  const tmpDir = join(base, 'tmp');
  if (!(await dirExists(tmpDir))) return [];

  const files = await findFiles(tmpDir, /^session-.*\.json$/, since);
  const results: NormalizedConversation[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    results.push(readGeminiSession(content));
  }

  return results;
}

const defaultHome = process.env.HOME ?? os.homedir();

export async function discoverConversations(
  options: DiscoverOptions = {},
): Promise<NormalizedConversation[]> {
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

  return [...claude, ...codex, ...gemini];
}
