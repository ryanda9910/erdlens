#!/usr/bin/env node
// erdlens — Mermaid ERD from your schema, embeddable into docs, with drift-check.
// Runs as an MCP server over stdio (default) or a small CLI for one-off use.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "mcp" || cmd === "serve") {
  // MCP stdio server (what Claude Code launches)
  await import("../src/server.js");
} else if (cmd === "erd") {
  // CLI: erdlens erd <schema-file>  -> print mermaid
  const erd = require("../src/erd.cjs");
  const text = readFileSync(argv[1], "utf8");
  console.log(erd.schemaToMermaid(text, argv[2] || "auto"));
} else if (cmd === "drift") {
  // CLI: erdlens drift <doc.mmd|md> <schema-file>
  const erd = require("../src/erd.cjs");
  const drift = require("../src/drift.cjs");
  const doc = readFileSync(argv[1], "utf8");
  const diagram = (doc.match(/```mermaid\s*([\s\S]*?)```/i) || [null, doc])[1].trim();
  const schema = readFileSync(argv[2], "utf8");
  const d = drift.diff(diagram, schema, { currentSource: argv[3] || "auto" });
  console.log(drift.report(d));
  process.exit(d.stale ? 1 : 0);
} else {
  console.error("usage: erdlens [mcp] | erd <schema> [type] | drift <doc> <schema> [type]");
  process.exit(2);
}
