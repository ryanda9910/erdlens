# Changelog

All notable changes to erdlens are documented here.

## [0.1.0] — 2026-07-04

First release.

### Added
- MCP server (zero-dep, from-scratch JSON-RPC over stdio) with three tools: `schema_to_erd`,
  `render_erd`, `drift_check`.
- Schema parsers for SQL DDL, Prisma, Drizzle, TypeORM, and SQLAlchemy, with auto-detection.
- Mermaid `erDiagram` output with PK / FK / UK markers and relations.
- Drift check: diff an ERD embedded in a doc against the current schema, report added/removed
  tables, columns, and relations. Non-zero CLI exit when stale.
- `render_erd` writes `.mmd` + embeddable `.md` + self-contained `.html` preview.
- CLI (`erdlens erd` / `erdlens drift`) for use without an MCP client.
- 37 tests (24 engine + 13 MCP stdio), README + i18n (EN / ID / zh-CN), MIT.

[0.1.0]: https://github.com/ryanda9910/erdlens/releases/tag/v0.1.0
