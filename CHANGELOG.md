# Changelog

All notable changes to erdlens are documented here.

## [0.1.0] — 2026-07-04

First release.

### Added
- MCP server (zero runtime deps, from-scratch JSON-RPC over stdio) with five tools: `schema_to_erd`,
  `render_erd`, `drift_check`, `workflow_to_diagram`, `render_workflow`.
- Schema parsers for SQL DDL, Prisma, Drizzle, TypeORM, and SQLAlchemy, with auto-detection.
- Workflow parser: a text DSL and JSON steps → Mermaid `flowchart` (start/end/decision nodes,
  labelled branches).
- Mermaid `erDiagram` output with PK / FK / UK markers and relations.
- Drift check: diff an ERD embedded in a doc against the current schema, report added/removed
  tables, columns, and relations. Non-zero CLI exit when stale.
- `render_erd` / `render_workflow` write `.mmd` + embeddable `.md` + self-contained `.html` preview.
- CLI (`erdlens erd` / `flow` / `drift` / `tune`) for use without an MCP client.
- Self-improving loop (`erdlens tune`): maker → independent checker → reflect, with a regression guard
  and memory in `~/.erdlens/`.
- Written in TypeScript, MVVM (model / viewmodel / view), compiled to `dist/`.
- 57 tests (24 schema + 14 workflow + 19 MCP stdio) + an end-to-end script that drives a real Claude
  Code run. Conventional Commits via husky + commitlint. README + i18n (EN / ID / zh-CN), MIT.

[0.1.0]: https://github.com/ryanda9910/erdlens/releases/tag/v0.1.0
