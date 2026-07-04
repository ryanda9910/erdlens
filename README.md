<p align="center">
  <img src="assets/logo.svg" alt="erdlens" width="96" height="96" />
</p>

<h1 align="center">erdlens</h1>

<p align="center"><b>Your schema becomes an ER diagram, straight into your docs. And it tells you when the diagram goes stale.</b></p>

<p align="center">
  🇺🇸 English · <a href="README.id.md">🇮🇩 Bahasa Indonesia</a> · <a href="README.zh-CN.md">🇨🇳 简体中文</a>
</p>

<p align="center">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-6C8EEF" />
  <img alt="deps" src="https://img.shields.io/badge/dependencies-0-6C8EEF" />
  <img alt="tests" src="https://img.shields.io/badge/tests-37%20passing-6C8EEF" />
  <img alt="mcp" src="https://img.shields.io/badge/MCP-server-6C8EEF" />
</p>

---

You ask Claude Code to document your database. It writes the doc, you generate an ER diagram in some
other tool, then you copy-paste the diagram back in. Two tools, double work, and the moment someone
runs a migration the diagram in the doc is quietly wrong.

**erdlens** is an MCP server that closes that loop. Claude Code reads your schema, turns it into a
Mermaid ER diagram, and writes it **into** the document in one pass. No second tool, no copy-paste.
And it can check later whether that diagram still matches the schema.

## Why it's different

The existing diagram MCP servers render Mermaid you already wrote. erdlens starts a step earlier: it
**reads the schema for you**, and a step later: it **watches for drift**.

|  | render your Mermaid | read the schema | write into the doc | drift-check |
|--|:--:|:--:|:--:|:--:|
| mermaid-preview MCPs | ✅ | ❌ | partial | ❌ |
| mermerd (CLI, not MCP) | ❌ | ✅ (DB only) | ❌ | ❌ |
| **erdlens** | ✅ | ✅ (5 sources) | ✅ | ✅ |

Schema sources: **SQL DDL, Prisma, Drizzle, TypeORM, SQLAlchemy** — file or text, auto-detected.

## Install (Claude Code)

```bash
claude mcp add erdlens -- npx -y github:ryanda9910/erdlens
```

Or point at a local clone:

```bash
git clone https://github.com/ryanda9910/erdlens
claude mcp add erdlens -- node /abs/path/to/erdlens/bin/erdlens.js
```

Then just ask Claude Code: *"document the database and put an ER diagram in docs/schema.md"*. It calls
`render_erd` and the diagram lands in the file.

## Tools

| tool | what it does |
|--|--|
| `schema_to_erd` | schema (path or text) → Mermaid `erDiagram` + a ```mermaid fenced block to paste anywhere |
| `render_erd` | writes the diagram to disk: `.mmd` source, an embeddable `.md`, and a self-contained `.html` preview — so it goes straight into a doc, no copy-paste |
| `drift_check` | compares an ERD already in a `.mmd`/`.md` against the current schema, and reports every table, column, and relation added or removed since. Run it in CI so a stale diagram fails the build |

## The drift check

This is the part that keeps docs honest. After a migration:

```
$ erdlens drift docs/schema.md db/schema.sql
Diagram is stale. It drifted from the current schema:
  + tables added since: audit_logs
  ~ posts: +published +slug
  + relations added: posts->users
Regenerate with render_erd to fix.
```

Exit code is non-zero when stale, so it drops into a CI step or a pre-commit hook.

## Also a CLI

Without an MCP client:

```bash
erdlens erd db/schema.sql            # print the Mermaid ERD
erdlens erd prisma/schema.prisma     # auto-detects Prisma
erdlens drift docs/erd.mmd db/schema.sql   # exit 1 if drifted
```

## Tests

```bash
npm test    # 24 engine assertions + 13 MCP stdio assertions
```

Zero dependencies. The MCP server is a from-scratch JSON-RPC stdio implementation; the HTML preview
loads Mermaid from a CDN only when you open it in a browser.

## License

MIT
