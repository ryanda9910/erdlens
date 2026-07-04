#!/usr/bin/env node
/* erdlens entry — MVVM composition root.
 * `erdlens` / `erdlens mcp` → MCP server (View). Anything else → CLI (View).
 */
import { serve } from "./view/mcpServer.js";
import { runCli } from "./view/cli.js";

const argv = process.argv.slice(2);
const cmd = argv[0];

if (!cmd || cmd === "mcp" || cmd === "serve") {
  serve();
} else {
  process.exit(runCli(argv));
}
