# ADR-001: TypeScript + Node.js Stack

## Status

Accepted

## Context

drift-watch needs to analyze AI agent session logs, detect behavioral patterns, and feed corrections back into agent configurations. The tool must integrate with Claude Code, Codex, and Gemini CLI ecosystems.

Key requirements:

- Parse and analyze structured logs (JSONL, markdown)
- Integrate with git repositories and agent config files
- CLI-first interface for use in agent workflows
- Local-first with optional LLM inference (node-llama-cpp already in deps)

## Decision

Use TypeScript on Node.js with:

- **TypeScript strict mode** for type safety and agent-readable code
- **pnpm** for package management (already in use)
- **Vitest** for testing (fast, ESM-native, TS-first)
- **ESLint + Prettier** for code quality enforcement
- **ESM modules** (`"type": "module"`) for modern import/export

## Consequences

- Type safety catches errors at compile time, reducing agent debugging loops
- ESM alignment with modern Node.js ecosystem
- Vitest provides fast feedback for TDD workflow
- Strict linting prevents drift in code style across agent sessions
