# drift-watch

Drift and repetitive error analyzer for AI agentic coding sessions.

Detects behavioral patterns, recurring mistakes, and suggests corrective strategies across Claude Code, Codex, and Gemini CLI.

## Concept

Agentic AI coding creates emergent behaviors that didn't exist before. **drift-watch** monitors these behaviors over time, identifies patterns, and feeds corrections back into the system (linter rules, test cases, CLAUDE.md updates, documentation) - creating a self-improving feedback loop.

## Status

Early development -- foundational infrastructure in place, implementation pending.

## Getting Started

```bash
pnpm install
pnpm check     # type-check + lint + format check
pnpm test      # run tests
```

## Development

```bash
pnpm test:watch    # tests in watch mode
pnpm lint          # ESLint
pnpm format        # Prettier auto-format
pnpm build         # compile TypeScript
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for planned layers, modules, and data flow.

## Decisions

Architectural decisions are recorded in [docs/adr/](docs/adr/).
