/* erdlens View — CLI. Thin argument router over the model + viewmodel, for use
 * without an MCP client. `erdlens mcp` launches the server (see index.ts).
 */
import { readFileSync } from "node:fs";
import * as erd from "../model/erd.js";
import * as drift from "../model/drift.js";
import * as flow from "../model/flow.js";
import { tune } from "../viewmodel/tune.js";
import type { SchemaSource, FlowSource } from "../model/types.js";

export function runCli(argv: string[]): number {
  const cmd = argv[0];
  if (cmd === "erd") {
    const text = readFileSync(argv[1]!, "utf8");
    console.log(erd.schemaToMermaid(text, (argv[2] as SchemaSource) || "auto"));
    return 0;
  }
  if (cmd === "flow") {
    const text = readFileSync(argv[1]!, "utf8");
    console.log(flow.flowToMermaid(text, (argv[2] as FlowSource) || "auto", {}));
    return 0;
  }
  if (cmd === "drift") {
    const doc = readFileSync(argv[1]!, "utf8");
    const diagram = (doc.match(/```mermaid\s*([\s\S]*?)```/i) || [null, doc])[1]!.trim();
    const schema = readFileSync(argv[2]!, "utf8");
    const d = drift.diff(diagram, schema, { currentSource: (argv[3] as SchemaSource) || "auto" });
    console.log(drift.report(d));
    return d.stale ? 1 : 0;
  }
  if (cmd === "tune") {
    const r = tune();
    console.log(r.text);
    return r.pass ? 0 : 1;
  }
  console.error("usage: erdlens [mcp] | erd <schema> [type] | flow <workflow> [type] | drift <doc> <schema> [type] | tune");
  return 2;
}
