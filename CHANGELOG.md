# Changelog

All notable changes to erdlens are documented here.

## [0.2.0] — 2026-07-04

### Added
- Workflow diagrams: `workflow_to_diagram` and `render_workflow` tools. A text DSL or JSON steps become
  a Mermaid `flowchart` (start/end/decision nodes, labelled branches), embeddable the same way as the ERD.
- Self-improving loop (`erdlens tune`): maker → independent checker → reflect, with a regression guard
  and memory in `~/.erdlens/`.
- End-to-end test that drives the MCP server through a real Claude Code run (`test/e2e.sh`).
- A showcase reel + GIF.

### Changed
- Rewritten in TypeScript, laid out MVVM (model / viewmodel / view), compiled to `dist/`. Zero runtime
  dependencies kept.
- Commits standardised on husky + commitlint.
- Now 57 tests (24 schema + 14 workflow + 19 MCP stdio).

## [0.1.0] — 2026-07-04

First release.

### Added
- MCP server (zero runtime deps, from-scratch JSON-RPC over stdio): `schema_to_erd`, `render_erd`,
  `drift_check`.
- Schema parsers for SQL DDL, Prisma, Drizzle, TypeORM, and SQLAlchemy, with auto-detection.
- Mermaid `erDiagram` output with PK / FK / UK markers and relations.
- Drift check: diff an ERD embedded in a doc against the current schema. Non-zero CLI exit when stale.
- `render_erd` writes `.mmd` + embeddable `.md` + self-contained `.html` preview.
- CLI for use without an MCP client. README + i18n (EN / ID / zh-CN), MIT.

[0.2.0]: https://github.com/ryanda9910/erdlens/releases/tag/v0.2.0
[0.1.0]: https://github.com/ryanda9910/erdlens/releases/tag/v0.1.0
