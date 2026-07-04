/* erdlens View — MCP server. From-scratch JSON-RPC 2.0 over stdio. Zero deps.
 * Pure transport: parses requests, delegates to the diagram ViewModel, formats replies.
 */
import * as vm from "../viewmodel/diagram.js";

const PROTOCOL_VERSION = "2024-11-05";
const NAME = "erdlens";
const VERSION = "0.2.0";

interface Tool { name: string; description: string; inputSchema: unknown; }

export const TOOLS: Tool[] = [
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
      "Generate a Mermaid ERD from a schema and WRITE it to disk so it can be embedded directly in a document with no copy-paste. Writes out_path (.mmd), a sibling .md with the fenced block, and a self-contained .html preview.",
    inputSchema: {
      type: "object",
      properties: {
        source_path: { type: "string" }, source_text: { type: "string" },
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
  {
    name: "workflow_to_diagram",
    description:
      "Turn a workflow spec into a Mermaid flowchart. Accepts a tiny text DSL (`a -> b`, `a -> b : label`, chains, `?` decisions, start/end) or a JSON array of steps. Returns the Mermaid source + a ```mermaid fenced block.",
    inputSchema: {
      type: "object",
      properties: {
        source_path: { type: "string" }, source_text: { type: "string" },
        source_type: { type: "string", enum: ["auto", "dsl", "json"] },
        direction: { type: "string", enum: ["TD", "LR"] },
      },
    },
  },
  {
    name: "render_workflow",
    description:
      "Generate a Mermaid flowchart from a workflow spec and WRITE it to disk (.mmd + embeddable .md + .html preview). Same as render_erd but for workflows/pipelines.",
    inputSchema: {
      type: "object",
      properties: {
        source_path: { type: "string" }, source_text: { type: "string" },
        out_path: { type: "string", description: "Where to write the .mmd, e.g. docs/workflow.mmd" },
        source_type: { type: "string", enum: ["auto", "dsl", "json"] },
        direction: { type: "string", enum: ["TD", "LR"] },
      },
      required: ["out_path"],
    },
  },
];

export function handleTool(name: string, args: Record<string, unknown>): { content: { type: "text"; text: string }[] } {
  const text = ((): string => {
    switch (name) {
      case "schema_to_erd": return vm.schemaToErd(args as vm.Source);
      case "render_erd": return vm.renderErd(args as unknown as vm.Source & { out_path: string });
      case "drift_check": return vm.driftCheck(args as unknown as { doc_path: string; schema_path: string });
      case "workflow_to_diagram": return vm.workflowToDiagram(args as vm.Source);
      case "render_workflow": return vm.renderWorkflow(args as unknown as vm.Source & { out_path: string });
      default: throw new Error(`unknown tool: ${name}`);
    }
  })();
  return { content: [{ type: "text", text }] };
}

// ── JSON-RPC over stdio ──
interface RpcMessage { id?: number | string; method?: string; params?: Record<string, unknown>; }

function send(msg: unknown): void { process.stdout.write(JSON.stringify(msg) + "\n"); }
function ok(id: RpcMessage["id"], result: unknown): void { send({ jsonrpc: "2.0", id, result }); }
function err(id: RpcMessage["id"], code: number, message: string): void { send({ jsonrpc: "2.0", id, error: { code, message } }); }

function onMessage(msg: RpcMessage): void {
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: NAME, version: VERSION } });
    }
    if (method === "notifications/initialized") return;
    if (method === "tools/list") return ok(id, { tools: TOOLS });
    if (method === "tools/call") {
      const p = params as { name: string; arguments?: Record<string, unknown> };
      return ok(id, handleTool(p.name, p.arguments || {}));
    }
    if (method === "ping") return ok(id, {});
    if (id !== undefined) err(id, -32601, `method not found: ${method}`);
  } catch (e) {
    if (id !== undefined) ok(id, { content: [{ type: "text", text: "Error: " + ((e as Error)?.message || e) }], isError: true });
  }
}

export function serve(): void {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: RpcMessage;
      try { msg = JSON.parse(line); } catch { continue; }
      onMessage(msg);
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
