# drift-watch

Drift and repetitive error analyzer for AI agentic coding sessions.

Detects behavioral patterns, recurring mistakes, and suggests corrective strategies across Claude Code, Codex, and Gemini CLI.

## Concept

Agentic AI coding creates emergent behaviors that didn't exist before. **drift-watch** monitors these behaviors over time, identifies patterns, and feeds corrections back into the system (linter rules, test cases, CLAUDE.md updates, documentation) - creating a self-improving feedback loop.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Dolt](https://www.dolthub.com/docs/tutorials/installation/) (database)
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) (for analysis and suggestions)

## Installation

```bash
npm install -g drift-watch
```

## Quick Start

```bash
# Initialize the database and check prerequisites
drift-watch init

# Scan conversations for drift patterns
drift-watch scan

# View a report of detected patterns
drift-watch report

# Get corrective strategy suggestions
drift-watch suggest
```

## Commands

### `drift-watch init`

Initialize the drift-watch data directory (`~/.drift-watch`), start the Dolt database server, and apply schema migrations.

### `drift-watch scan`

Discover new AI conversations from Claude Code, Codex, and Gemini CLI. Analyze them for behavioral patterns and store findings in the database.

### `drift-watch status`

Show the current state of the drift-watch server and database.

### `drift-watch report [options]`

Display detected patterns and findings.

| Option             | Description                |
| ------------------ | -------------------------- |
| `--by-model`       | Group findings by AI model |
| `--by-project`     | Group findings by project  |
| `--since <date>`   | Filter findings after date |
| `--category <cat>` | Filter by category         |
| `--limit <n>`      | Max rows (default: 20)     |

### `drift-watch suggest [options]`

Generate corrective strategies for detected patterns using Claude.

| Option           | Description                          |
| ---------------- | ------------------------------------ |
| `--pattern <id>` | Target a specific pattern            |
| `--limit <n>`    | Max patterns to process (default: 5) |

### `drift-watch config show`

Display the current configuration.

### `drift-watch config set <key> <value>`

Update a configuration value. Available keys:

| Key                 | Default     | Description                           |
| ------------------- | ----------- | ------------------------------------- |
| `scan_interval`     | `0 3 * * 0` | Cron expression for scheduled scans   |
| `claude_model`      | `sonnet`    | Claude model for analysis             |
| `categories`        | `all`       | Comma-separated category filter       |
| `excluded_projects` | _(none)_    | Comma-separated project paths to skip |
| `dolt_port`         | _(auto)_    | Override the Dolt server port         |

### `drift-watch cron install [--interval <cron-expr>]`

Add a crontab entry for periodic scanning. Default: weekly on Sunday at 3am (`0 3 * * 0`).

### `drift-watch cron remove`

Remove the drift-watch crontab entry.

### `drift-watch cron status`

Show whether the cron job is installed and the last run date.

## Development

```bash
pnpm install
pnpm test          # run tests
pnpm test:watch    # tests in watch mode
pnpm lint          # ESLint
pnpm format        # Prettier auto-format
pnpm build         # compile TypeScript
pnpm check         # type-check + lint + format check
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for layers, modules, and data flow.

## Decisions

Architectural decisions are recorded in [docs/adr/](docs/adr/).

## License

[ISC](LICENSE)
