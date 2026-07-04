// Drives the erdlens MCP server over real stdio JSON-RPC, the way Claude Code would.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert";

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log("  ok  " + name); } else { fail++; console.log("FAIL  " + name); } }

const dir = mkdtempSync(join(tmpdir(), "erdlens-"));
const schemaPath = join(dir, "schema.sql");
writeFileSync(schemaPath, `
CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT UNIQUE);
CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES users(id));
`);

const srv = spawn(process.execPath, ["dist/index.js", "mcp"], { stdio: ["pipe", "pipe", "inherit"] });
let outBuf = "";
const pending = new Map();
srv.stdout.on("data", (c) => {
  outBuf += c;
  let nl;
  while ((nl = outBuf.indexOf("\n")) >= 0) {
    const line = outBuf.slice(0, nl).trim();
    outBuf = outBuf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  }
});
function rpc(id, method, params) {
  return new Promise((res) => { pending.set(id, res); srv.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
}

const init = await rpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {} });
check("initialize returns serverInfo", init.result?.serverInfo?.name === "erdlens");

const list = await rpc(2, "tools/list", {});
const toolNames = (list.result?.tools || []).map((t) => t.name);
check("tools/list has 5 tools", toolNames.length === 5);
check("exposes schema_to_erd", toolNames.includes("schema_to_erd"));
check("exposes render_erd", toolNames.includes("render_erd"));
check("exposes drift_check", toolNames.includes("drift_check"));
check("exposes workflow_to_diagram", toolNames.includes("workflow_to_diagram"));
check("exposes render_workflow", toolNames.includes("render_workflow"));

const s2e = await rpc(3, "tools/call", { name: "schema_to_erd", arguments: { source_path: schemaPath } });
const s2eText = s2e.result?.content?.[0]?.text || "";
check("schema_to_erd returns mermaid fence", /```mermaid/.test(s2eText) && /erDiagram/.test(s2eText));
check("schema_to_erd shows relation", /posts \|\|--o\{ users/.test(s2eText));

const outMmd = join(dir, "erd.mmd");
const render = await rpc(4, "tools/call", { name: "render_erd", arguments: { source_path: schemaPath, out_path: outMmd } });
check("render_erd wrote .mmd", existsSync(outMmd));
check("render_erd wrote .md", existsSync(join(dir, "erd.md")));
check("render_erd wrote .html preview", existsSync(join(dir, "erd.html")));
check("render_erd .mmd has erDiagram", /erDiagram/.test(readFileSync(outMmd, "utf8")));

// drift: current doc matches -> in sync
const inSync = await rpc(5, "tools/call", { name: "drift_check", arguments: { doc_path: outMmd, schema_path: schemaPath } });
check("drift_check in sync", /in sync/i.test(inSync.result?.content?.[0]?.text || ""));

// add a table to the schema -> drift flagged
writeFileSync(schemaPath, readFileSync(schemaPath, "utf8") + "\nCREATE TABLE tags (id INTEGER PRIMARY KEY);");
const drifted = await rpc(6, "tools/call", { name: "drift_check", arguments: { doc_path: outMmd, schema_path: schemaPath } });
const dText = drifted.result?.content?.[0]?.text || "";
check("drift_check flags stale after new table", /stale/i.test(dText) && /tags/.test(dText));

// workflow_to_diagram
const wf = await rpc(7, "tools/call", { name: "workflow_to_diagram", arguments: { source_text: "start -> validate\nvalidate -> charge : ok\nvalidate -> reject : fail\ncharge -> done" } });
const wfText = wf.result?.content?.[0]?.text || "";
check("workflow_to_diagram returns flowchart", /```mermaid/.test(wfText) && /flowchart TD/.test(wfText));
check("workflow_to_diagram keeps branch label", /validate -->\|ok\| charge/.test(wfText));

// render_workflow writes files
const wfOut = join(dir, "wf.mmd");
await rpc(8, "tools/call", { name: "render_workflow", arguments: { source_text: "a -> b -> c", out_path: wfOut } });
check("render_workflow wrote .mmd", existsSync(wfOut) && /flowchart/.test(readFileSync(wfOut, "utf8")));
check("render_workflow wrote .html", existsSync(join(dir, "wf.html")));

srv.stdin.end();
srv.kill();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
