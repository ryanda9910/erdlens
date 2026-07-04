/* erdlens flow model — turn a workflow spec into a Mermaid flowchart.
 * Two inputs: a tiny text DSL, or a JSON array of steps.
 */
import type { FlowSource, Graph, NodeShape } from "./types.js";

export function emptyGraph(): Graph {
  return { nodes: new Map(), edges: [] };
}

function shapeOf(id: string): NodeShape {
  const l = String(id).toLowerCase();
  if (/\?$/.test(id)) return "decision";
  if (["start", "begin"].includes(l)) return "start";
  if (["end", "done", "stop", "finish"].includes(l)) return "end";
  return "step";
}
function nodeId(raw: string): string { return String(raw).trim().replace(/\?$/, ""); }

function addNode(g: Graph, raw: string): string {
  const id = nodeId(raw);
  if (!id) return id;
  if (!g.nodes.has(id)) g.nodes.set(id, { id, shape: shapeOf(raw), label: id });
  else if (/\?$/.test(raw)) g.nodes.get(id)!.shape = "decision";
  return id;
}
function addEdge(g: Graph, from: string, to: string, label = ""): void {
  const f = addNode(g, from), t = addNode(g, to);
  if (f && t) g.edges.push({ from: f, to: t, label });
}

export function detectFlow(src: string): Exclude<FlowSource, "auto"> {
  const s = String(src || "").trim();
  return s.startsWith("[") || s.startsWith("{") ? "json" : "dsl";
}

export function parse(src: string, kind?: FlowSource): Graph {
  const k = kind && kind !== "auto" ? kind : detectFlow(src);
  return k === "json" ? parseJSON(src) : parseDSL(src);
}

function parseDSL(src: string): Graph {
  const g = emptyGraph();
  for (const rawLine of String(src).split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line || !line.includes("->")) continue;
    let label = "";
    const lm = line.match(/:\s*([^:]+?)\s*$/);
    let body = line;
    if (lm && line.split("->").length === 2) { label = lm[1]!.trim(); body = line.slice(0, line.lastIndexOf(":")); }
    const parts = body.split("->").map((p) => p.trim()).filter(Boolean);
    for (let i = 0; i + 1 < parts.length; i++) {
      const isLast = i + 2 === parts.length;
      addEdge(g, parts[i]!, parts[i + 1]!, isLast ? label : "");
    }
  }
  return g;
}

interface JsonStep { id?: string; name?: string; decision?: boolean; next?: string | (string | { to?: string; when?: string; label?: string })[] | { to?: string; when?: string; label?: string }; }

function parseJSON(src: string | unknown): Graph {
  const g = emptyGraph();
  let data: unknown;
  try { data = typeof src === "string" ? JSON.parse(src) : src; } catch { return g; }
  const steps: JsonStep[] = Array.isArray(data) ? data : ((data as { steps?: JsonStep[] })?.steps || []);
  for (const step of steps) {
    const id = step.id || step.name;
    if (!id) continue;
    addNode(g, step.decision ? id + "?" : id);
    const nexts = step.next == null ? [] : Array.isArray(step.next) ? step.next : [step.next];
    for (const n of nexts) {
      if (typeof n === "string") addEdge(g, id, n, "");
      else if (n && n.to) addEdge(g, id, n.to, n.when || n.label || "");
    }
  }
  return g;
}

export interface RenderOpts { direction?: "TD" | "LR"; }

export function toMermaid(g: Graph, opts: RenderOpts = {}): string {
  const dir = opts.direction || "TD";
  const lines = [`flowchart ${dir}`];
  for (const n of g.nodes.values()) {
    const safe = n.label.replace(/["\]]/g, "");
    if (n.shape === "start" || n.shape === "end") lines.push(`  ${n.id}(["${safe}"])`);
    else if (n.shape === "decision") lines.push(`  ${n.id}{"${safe}"}`);
    else lines.push(`  ${n.id}["${safe}"]`);
  }
  for (const e of g.edges) {
    lines.push(e.label ? `  ${e.from} -->|${e.label}| ${e.to}` : `  ${e.from} --> ${e.to}`);
  }
  return lines.join("\n");
}

export function flowToMermaid(src: string, kind?: FlowSource, opts: RenderOpts = {}): string {
  return toMermaid(parse(src, kind), opts);
}

export function parseMermaid(mmd: string): Graph {
  const g = emptyGraph();
  for (const raw of String(mmd).split("\n")) {
    const line = raw.trim();
    if (!line || /^flowchart|^graph/i.test(line)) continue;
    const em = line.match(/^(\w+).*?-->\s*(?:\|([^|]*)\|\s*)?(\w+)/);
    if (em) { addEdge(g, em[1]!, em[3]!, em[2] || ""); continue; }
    const nm = line.match(/^(\w+)\s*[[({]/);
    if (nm) addNode(g, nm[1]!);
  }
  return g;
}
