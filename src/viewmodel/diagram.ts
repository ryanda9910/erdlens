/* erdlens ViewModel — diagram operations. Coordinates the model (erd/drift/flow)
 * with file I/O and presentation, independent of any transport (MCP or CLI).
 * Views (mcpServer, cli) call these; they don't touch the model directly.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import * as erd from "../model/erd.js";
import * as drift from "../model/drift.js";
import * as flow from "../model/flow.js";
import type { SchemaSource, FlowSource } from "../model/types.js";
import { fenced, writeDiagram } from "../view/render.js";

export interface Source { source_path?: string; source_text?: string; }

function loadSource(args: Source): string {
  if (args.source_text) return args.source_text;
  if (args.source_path) return readFileSync(args.source_path, "utf8");
  throw new Error("provide source_path or source_text");
}

export function schemaToErd(args: Source & { source_type?: SchemaSource }): string {
  const text = loadSource(args);
  const mmd = erd.schemaToMermaid(text, args.source_type || "auto");
  const type = args.source_type && args.source_type !== "auto" ? args.source_type : erd.detect(text);
  const tables = Object.keys(erd.parse(text, args.source_type || "auto").tables).length;
  return `Detected ${type} schema, ${tables} tables.\n\n${fenced(mmd)}`;
}

export function renderErd(args: Source & { out_path: string; source_type?: SchemaSource }): string {
  const mmd = erd.schemaToMermaid(loadSource(args), args.source_type || "auto");
  return writeDiagram(args.out_path, mmd, "ER diagram");
}

export function workflowToDiagram(args: Source & { source_type?: FlowSource; direction?: "TD" | "LR" }): string {
  const text = loadSource(args);
  const mmd = flow.flowToMermaid(text, args.source_type || "auto", { direction: args.direction || "TD" });
  const g = flow.parse(text, args.source_type || "auto");
  return `Workflow: ${g.nodes.size} steps, ${g.edges.length} transitions.\n\n${fenced(mmd)}`;
}

export function renderWorkflow(args: Source & { out_path: string; source_type?: FlowSource; direction?: "TD" | "LR" }): string {
  const mmd = flow.flowToMermaid(loadSource(args), args.source_type || "auto", { direction: args.direction || "TD" });
  return writeDiagram(args.out_path, mmd, "workflow");
}

function extractDiagram(text: string): string {
  const fence = text.match(/```mermaid\s*([\s\S]*?)```/i);
  return (fence ? fence[1]! : text).trim();
}

export function driftCheck(args: { doc_path: string; schema_path: string; schema_type?: SchemaSource }): string {
  const diagram = extractDiagram(readFileSync(args.doc_path, "utf8"));
  const schemaText = readFileSync(args.schema_path, "utf8");
  const d = drift.diff(diagram, schemaText, { currentSource: args.schema_type || "auto" });
  return drift.report(d) + (d.stale ? "\n\nRegenerate with render_erd to fix." : "");
}
