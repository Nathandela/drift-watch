import { DoltServer } from '../storage/dolt.js';
import { applyMigrations } from '../storage/migrations.js';
import { Repository } from '../storage/repository.js';
import { ClaudeRunner } from '../analysis/runner.js';
import { SUGGEST_SYSTEM_PROMPT } from '../analysis/suggest-prompt.js';
import { SuggestResponseSchema } from '../analysis/suggest-schema.js';
import { DEFAULT_DATA_DIR, readConfig } from '../config/index.js';
import { parseRelativeDate } from './report.js';
import { formatTable } from '../display/table.js';
import type { Pattern, Finding, SuggestRun, Suggestion } from '../storage/repository.js';

export interface SuggestOptions {
  dataDir?: string;
  patternId?: string;
  limit?: number;
  refresh?: boolean;
  since?: string;
}

export interface SuggestResultPattern {
  id: string;
  name: string;
  category: string | null;
}

export interface SuggestResultItem {
  patternId: string;
  strategyType: string;
  title: string;
  description: string;
  artifact?: string;
}

export interface SuggestResult {
  runId: string | null;
  patterns: SuggestResultPattern[];
  suggestions: SuggestResultItem[];
  empty: boolean;
}

export async function suggest(options: SuggestOptions = {}): Promise<SuggestResult> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const limit = options.limit ?? 5;

  const server = new DoltServer(dataDir);
  const conn = await server.connect();

  try {
    await applyMigrations(conn);
    const repo = new Repository(conn);
    const patterns = await getPatterns(repo, options, limit);

    if (patterns.length === 0) {
      return { runId: null, patterns: [], suggestions: [], empty: true };
    }

    let patternsToProcess: Pattern[];
    if (options.refresh) {
      const stale = await repo.patternsWithStaleSuggestions();
      const existing = await repo.patternsWithSuggestions();
      patternsToProcess = patterns.filter((p) => !existing.has(p.id) || stale.has(p.id));
    } else {
      const existing = await repo.patternsWithSuggestions();
      patternsToProcess = patterns.filter((p) => !existing.has(p.id));
    }

    if (patternsToProcess.length === 0) {
      return { runId: null, patterns: [], suggestions: [], empty: true };
    }

    const config = readConfig(dataDir);
    const runner = new ClaudeRunner({ model: config.suggest_model });

    const runId = await repo.insertSuggestRun({
      started_at: new Date(),
      finished_at: null,
      status: 'running',
      patterns_processed: 0,
      suggestions_count: 0,
    });

    const allSuggestions: SuggestResultItem[] = [];

    try {
      for (const pattern of patternsToProcess) {
        const items = await generateForPattern(runner, repo, pattern);
        allSuggestions.push(...items);
      }

      await storeSuggestions(repo, allSuggestions, runId);

      await repo.updateSuggestRun(runId, {
        finished_at: new Date(),
        status: 'completed',
        patterns_processed: patternsToProcess.length,
        suggestions_count: allSuggestions.length,
      });

      await repo.doltCommit(
        `suggest: ${allSuggestions.length} suggestion(s) for ${patternsToProcess.length} pattern(s)`,
      );
    } catch (err) {
      await repo.updateSuggestRun(runId, {
        finished_at: new Date(),
        status: 'failed',
      });
      throw err;
    }

    return {
      runId,
      patterns: patternsToProcess.map((p) => ({ id: p.id, name: p.name, category: p.category })),
      suggestions: allSuggestions,
      empty: false,
    };
  } finally {
    await conn.end();
  }
}

async function getPatterns(
  repo: Repository,
  options: SuggestOptions,
  limit: number,
): Promise<Pattern[]> {
  if (options.patternId) {
    const pattern = await repo.getPattern(options.patternId);
    return pattern ? [pattern] : [];
  }
  if (options.since) {
    return repo.getPatternsSince(options.since, limit);
  }
  return repo.getTopPatterns(limit);
}

async function generateForPattern(
  runner: ClaudeRunner,
  repo: Repository,
  pattern: Pattern,
): Promise<SuggestResultItem[]> {
  const examples = await repo.getExampleFindings(pattern.id);
  const input = buildPatternInput(pattern, examples);
  const response = await runner.runWithSchema(input, SUGGEST_SYSTEM_PROMPT, SuggestResponseSchema);

  return response.suggestions.map((s) => ({
    patternId: pattern.id,
    strategyType: s.strategy_type,
    title: s.title,
    description: s.description,
    artifact: s.artifact,
  }));
}

function buildPatternInput(pattern: Pattern, examples: Finding[]): string {
  const parts = [
    `Pattern: ${pattern.name}`,
    `Category: ${pattern.category ?? 'unknown'}`,
    `Severity: ${pattern.severity}`,
    `Occurrences: ${pattern.occurrence_count}`,
  ];
  if (pattern.description) {
    parts.push(`Description: ${pattern.description}`);
  }
  if (examples.length > 0) {
    parts.push('', 'Example findings:');
    for (const ex of examples) {
      parts.push(`- ${ex.title}: ${ex.description ?? 'No description'}`);
    }
  }
  return parts.join('\n');
}

async function storeSuggestions(
  repo: Repository,
  items: SuggestResultItem[],
  suggestRunId: string | null,
): Promise<void> {
  for (const item of items) {
    await repo.insertSuggestion({
      finding_id: null,
      pattern_id: item.patternId,
      suggest_run_id: suggestRunId,
      title: item.title,
      description: item.description,
      action_type: item.strategyType,
      artifact: item.artifact ?? null,
    });
  }
}

export function printSuggestions(result: SuggestResult): void {
  if (result.empty) {
    console.log('No patterns found. Run "drift-watch scan" first to analyze conversations.');
    return;
  }

  for (const pattern of result.patterns) {
    const patternSuggestions = result.suggestions.filter((s) => s.patternId === pattern.id);
    if (patternSuggestions.length === 0) continue;

    console.log(`\n  Pattern: ${pattern.name} [${pattern.category ?? 'unknown'}]`);
    console.log(`  ${'─'.repeat(60)}`);

    for (const s of patternSuggestions) {
      console.log(`\n  [${s.strategyType}] ${s.title}`);
      console.log(`  ${s.description}`);
      if (s.artifact) {
        console.log(`\n  Artifact:`);
        for (const line of s.artifact.split('\n')) {
          console.log(`    ${line}`);
        }
      }
    }
  }
  console.log('');
}

export interface HistoryOptions {
  dataDir?: string;
  runId?: string;
}

export interface HistoryResult {
  mode: 'list' | 'detail';
  runs: SuggestRun[];
  suggestions: Suggestion[];
  empty: boolean;
}

export async function suggestHistory(options: HistoryOptions = {}): Promise<HistoryResult> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const server = new DoltServer(dataDir);
  const conn = await server.connect();

  try {
    await applyMigrations(conn);
    const repo = new Repository(conn);

    if (options.runId) {
      const run = await repo.getSuggestRun(options.runId);
      if (!run) {
        return { mode: 'detail', runs: [], suggestions: [], empty: true };
      }
      const suggestions = await repo.listSuggestionsByRun(options.runId);
      return { mode: 'detail', runs: [run], suggestions, empty: false };
    }

    const runs = await repo.listSuggestRuns();
    return { mode: 'list', runs, suggestions: [], empty: runs.length === 0 };
  } finally {
    await conn.end();
  }
}

function formatDate(val: unknown): string {
  if (val instanceof Date) return val.toISOString().slice(0, 19).replace('T', ' ');
  if (typeof val === 'string') return val.slice(0, 19);
  return '-';
}

export function printHistory(result: HistoryResult): void {
  if (result.empty) {
    if (result.mode === 'detail') {
      console.log('Suggest run not found.');
    } else {
      console.log('No suggest runs yet. Run "drift-watch suggest" first.');
    }
    return;
  }

  if (result.mode === 'list') {
    const headers = ['ID', 'Started', 'Status', 'Patterns', 'Suggestions'];
    const rows = result.runs.map((r) => [
      r.id,
      formatDate(r.started_at),
      r.status,
      String(r.patterns_processed),
      String(r.suggestions_count),
    ]);
    console.log(formatTable(rows, headers));
  } else {
    const run = result.runs[0];
    console.log(`\n  Run: ${run.id}`);
    console.log(`  Started: ${formatDate(run.started_at)}`);
    console.log(`  Status: ${run.status}`);
    console.log(`  Patterns processed: ${run.patterns_processed}`);
    console.log(`  Suggestions: ${run.suggestions_count}`);

    if (result.suggestions.length > 0) {
      console.log(`\n  ${'─'.repeat(60)}`);
      for (const s of result.suggestions) {
        console.log(`\n  [${s.action_type ?? 'unknown'}] ${s.title}`);
        if (s.description) console.log(`  ${s.description}`);
      }
    }
    console.log('');
  }
}

export function parseHistoryArgs(args: string[]): HistoryOptions {
  const options: HistoryOptions = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run') {
      if (i + 1 >= args.length) throw new Error('--run requires a value');
      options.runId = args[++i];
    }
  }
  return options;
}

export function parseSuggestArgs(args: string[]): SuggestOptions {
  const options: SuggestOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pattern':
        if (i + 1 >= args.length) throw new Error('--pattern requires a value');
        options.patternId = args[++i];
        break;
      case '--limit': {
        if (i + 1 >= args.length) throw new Error('--limit requires a value');
        const n = parseInt(args[++i], 10);
        if (isNaN(n) || n < 1) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = n;
        break;
      }
      case '--refresh':
        options.refresh = true;
        break;
      case '--since':
        if (i + 1 >= args.length) throw new Error('--since requires a value');
        options.since = parseRelativeDate(args[++i]);
        break;
    }
  }
  return options;
}
