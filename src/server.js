/* erdlens MCP server — from-scratch JSON-RPC 2.0 over stdio. Zero dependencies.
 *
 * Gives Claude Code (or any MCP client) tools to turn a schema into a Mermaid ERD,
 * save it as an embeddable file, and check whether an ERD already in a doc has
 * drifted from the current schema. The point: generate a diagram INTO a document
 * in one pass, no copy-paste, and catch it going stale later.
 *
 * Tools:
 *   schema_to_erd  { source_path? | source_text?, source_type? }  -> mermaid + fenced markdown
 *   render_erd     { source_path? | source_text?, out_path, source_type? } -> writes .mmd (+ .md + .html preview)
 *   drift_check    { doc_path, schema_path, ... }                 -> stale? + human report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const erd = require("./erd.cjs");
const drift = require("./drift.cjs");

const PROTOCOL_VERSION = "2024-11-05";
const NAME = "erdlens";
const VERSION = "0.1.0";

const TOOLS = [
  {
    name: "schema_to_erd",
    description:
      "Turn a database schema into a Mermaid erDiagram. Accepts SQL DDL, Prisma, Drizzle, TypeORM, or SQLAlchemy — pass a file path or the text directly. Returns the Mermaid source plus a ```mermaid fenced block you can paste straight into markdown.",
    inputSchema: {
      type: "object",
      properties: {
        source_path: { type: "string", description: "Path to a schema file (.sql, schema.prisma, *.ts, models.py)." },
        source_text: { type: "string", description: "Schema source as text (alternative to source_path)." },
        source_type: { type: "string", enum: ["auto", "sql", "prisma", "drizzle", "typeorm", "sqlalchemy"], description: "Defaults to auto-detect." },
      },
    },
  },
  {
    name: "render_erd",
    description:
      "Generate a Mermaid ERD from a schema and WRITE it to disk so it can be embedded directly in a document with no copy-paste. Writes out_path (.mmd), a sibling .md with the fenced block, and a self-contained .html preview. Returns the paths and a ready-to-embed markdown snippet.",
    inputSchema: {
      type: "object",
      properties: {
        source_path: { type: "string" },
        source_text: { type: "string" },
        out_path: { type: "string", description: "Where to write the .mmd file, e.g. docs/erd.mmd" },
        source_type: { type: "string", enum: ["auto", "sql", "prisma", "drizzle", "typeorm", "sqlalchemy"] },
      },
      required: ["out_path"],
    },
  },
  {
    name: "drift_check",
    description:
      "Check whether an ERD embedded in a doc (a .mmd file or a markdown file with a ```mermaid erDiagram block) still matches the current schema. Reports tables/columns/relations added or removed since the diagram was written. Use this in CI or before shipping docs.",
    inputSchema: {
      type: "object",
      properties: {
        doc_path: { type: "string", description: "The .mmd or .md file that contains the current diagram." },
        schema_path: { type: "string", description: "The current schema source to compare against." },
        schema_type: { type: "string", enum: ["auto", "sql", "prisma", "drizzle", "typeorm", "sqlalchemy"] },
      },
      required: ["doc_path", "schema_path"],
    },
  },
];

// ── tool impls ──
function loadSource(args) {
  if (args.source_text) return { text: args.source_text, name: "inline" };
  if (args.source_path) return { text: readFileSync(args.source_path, "utf8"), name: basename(args.source_path) };
  throw new Error("provide source_path or source_text");
}

function fenced(mmd) { return "```mermaid\n" + mmd + "\n```"; }

function extractDiagram(text) {
  // a raw .mmd, or a markdown ```mermaid block
  const fence = text.match(/```mermaid\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  return body.trim();
}

function previewHtml(mmd, title) {
  // self-contained: mermaid from a CDN. Opened locally, renders the diagram.
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<style>body{background:#0d0f12;color:#e7ecf3;font-family:system-ui;padding:24px}</style>
</head><body><h3>${title}</h3><pre class="mermaid">${mmd.replace(/</g, "&lt;")}</pre>
<script>mermaid.initialize({startOnLoad:true,theme:"dark"});<\/script></body></html>`;
}

function handleTool(name, args) {
  if (name === "schema_to_erd") {
    const { text } = loadSource(args);
    const mmd = erd.schemaToMermaid(text, args.source_type || "auto");
    const tableCount = Object.keys(erd.parse(text, args.source_type || "auto").tables).length;
    return textResult(`Detected ${args.source_type && args.source_type !== "auto" ? args.source_type : erd.detect(text)} schema, ${tableCount} tables.\n\n${fenced(mmd)}`);
  }
  if (name === "render_erd") {
    const { text } = loadSource(args);
    const mmd = erd.schemaToMermaid(text, args.source_type || "auto");
    const out = args.out_path;
    const stem = out.replace(/\.(mmd|md|html)$/i, "");
    writeFileSync(out.endsWith(".mmd") ? out : stem + ".mmd", mmd);
    const mdPath = stem + ".md";
    writeFileSync(mdPath, `# ${basename(stem)} — ER diagram\n\n${fenced(mmd)}\n`);
    const htmlPath = stem + ".html";
    writeFileSync(htmlPath, previewHtml(mmd, basename(stem)));
    return textResult(
      `Wrote:\n  ${stem}.mmd  (Mermaid source)\n  ${mdPath}  (embeddable markdown)\n  ${htmlPath}  (open in a browser to preview)\n\nEmbed it in any doc with:\n\n${fenced(mmd)}`,
    );
  }
  if (name === "drift_check") {
    const docText = readFileSync(args.doc_path, "utf8");
    const diagram = extractDiagram(docText);
    const schemaText = readFileSync(args.schema_path, "utf8");
    const d = drift.diff(diagram, schemaText, { currentSource: args.schema_type || "auto" });
    return textResult(drift.report(d) + (d.stale ? "\n\nRegenerate with render_erd to fix." : ""));
  }
  throw new Error(`unknown tool: ${name}`);
}

function textResult(text) { return { content: [{ type: "text", text }] }; }

// ── JSON-RPC over stdio ──
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
function ok(id, result) { send({ jsonrpc: "2.0", id, result }); }
function err(id, code, message) { send({ jsonrpc: "2.0", id, error: { code, message } }); }

function onMessage(msg) {
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } });
    }
    if (method === "notifications/initialized") return; // no response to notifications
    if (method === "tools/list") return ok(id, { tools: TOOLS });
    if (method === "tools/call") {
      const res = handleTool(params.name, params.arguments || {});
      return ok(id, res);
    }
    if (method === "ping") return ok(id, {});
    if (id !== undefined) err(id, -32601, `method not found: ${method}`);
  } catch (e) {
    if (id !== undefined) ok(id, { content: [{ type: "text", text: "Error: " + (e && e.message || e) }], isError: true });
  }
}

// newline-delimited JSON reader
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    onMessage(msg);
  }
});
process.stdin.on("end", () => process.exit(0));

export { TOOLS, handleTool, extractDiagram };
