# Architecture

## Overview

drift-watch monitors AI agentic coding sessions, detects behavioral drift and recurring errors, and feeds corrections back into the development system.

## Planned Layers

```
src/
  cli/          - CLI entry point and command parsing
  analyzers/    - Pattern detection and drift analysis engines
  collectors/   - Log and session data collection from various sources
  reporters/    - Output formatting (terminal, JSON, markdown)
  core/         - Shared types, config, and utilities
```

### Dependency Rules

- `cli/` depends on `analyzers/`, `collectors/`, `reporters/`
- `analyzers/` depends on `core/` only
- `collectors/` depends on `core/` only
- `reporters/` depends on `core/` only
- `core/` has no internal dependencies

### Data Flow

```
Collectors (logs, sessions) --> Analyzers (pattern detection) --> Reporters (output)
                                     |
                                     v
                              Corrective Actions
                         (linter rules, test cases,
                          CLAUDE.md updates, docs)
```

## Planned Modules

| Module                   | Responsibility                                   | Key interfaces                                |
| ------------------------ | ------------------------------------------------ | --------------------------------------------- |
| `collectors/agent-logs`  | Parse agent session logs (Claude, Codex, Gemini) | `collectSessions(path): Session[]`            |
| `collectors/git-history` | Extract commit patterns and error cycles         | `collectGitHistory(repo): GitEvent[]`         |
| `analyzers/drift`        | Detect behavioral drift over time                | `detectDrift(sessions): DriftPattern[]`       |
| `analyzers/repetition`   | Find recurring mistakes and fix cycles           | `findRepetitions(sessions): Repetition[]`     |
| `reporters/terminal`     | CLI output with actionable summaries             | `reportToTerminal(findings): void`            |
| `reporters/corrections`  | Generate corrective artifacts                    | `generateCorrections(findings): Correction[]` |

## Key Design Decisions

See `docs/adr/` for architectural decision records.
