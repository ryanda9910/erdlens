/* erdlens drift model — compare a diagram embedded in a doc against the current
 * schema and report what drifted. The piece no existing tool does.
 */
import type { DriftResult, Schema, SchemaSource } from "./types.js";
import * as erd from "./erd.js";

// parse a Mermaid erDiagram back into the schema model (diff a doc without a DB)
export function parseMermaid(mmd: string): Schema {
  const sch = erd.emptySchema();
  let cur: string | null = null;
  for (const raw of String(mmd).split("\n")) {
    const line = raw.trim();
    if (!line || /^erDiagram/i.test(line)) continue;
    const rel = line.match(/^(\w+)\s+([|}omp{<>o.-]+)\s+(\w+)\s*:/);
    if (rel && !cur) {
      const kind = /[}{]o--o[}{]/.test(rel[2]!) ? "N-N" : /\|\|--\|\|/.test(rel[2]!) ? "1-1" : "1-N";
      sch.rels.push({ from: rel[1]!, to: rel[3]!, kind });
      continue;
    }
    const open = line.match(/^(\w+)\s*\{$/);
    if (open) { cur = open[1]!; sch.tables[cur] = { columns: [] }; continue; }
    if (line === "}") { cur = null; continue; }
    if (cur) {
      const cm = line.match(/^(\w+)\s+(\w+)(?:\s+([\w,]+))?$/);
      if (cm) {
        const marks = (cm[3] || "").split(",");
        sch.tables[cur]!.columns.push({
          name: cm[2]!, type: cm[1]!.toUpperCase(),
          pk: marks.includes("PK"), fk: marks.includes("FK"),
          unique: marks.includes("UK"), nullable: true,
        });
      }
    }
  }
  return sch;
}

export function toSchema(input: string | Schema, source: SchemaSource = "auto"): Schema {
  if (input && typeof input === "object" && "tables" in input) return input;
  const s = String(input);
  if (/^\s*erDiagram/m.test(s)) return parseMermaid(s);
  return erd.parse(s, source);
}

export interface DiffOpts { docSource?: SchemaSource; currentSource?: SchemaSource; }

export function diff(docSide: string | Schema, currentSide: string | Schema, opts: DiffOpts = {}): DriftResult {
  const a = toSchema(docSide, opts.docSource || "auto");
  const b = toSchema(currentSide, opts.currentSource || "auto");

  const at = new Set(Object.keys(a.tables));
  const bt = new Set(Object.keys(b.tables));
  const addedTables = [...bt].filter((t) => !at.has(t));
  const removedTables = [...at].filter((t) => !bt.has(t));

  const columnChanges: DriftResult["columnChanges"] = [];
  for (const t of [...at].filter((x) => bt.has(x))) {
    const ac = new Map(a.tables[t]!.columns.map((c) => [c.name, c] as const));
    const bc = new Map(b.tables[t]!.columns.map((c) => [c.name, c] as const));
    const added = [...bc.keys()].filter((n) => !ac.has(n));
    const removed = [...ac.keys()].filter((n) => !bc.has(n));
    const changed: { column: string; was: string; now: string }[] = [];
    for (const n of [...ac.keys()].filter((x) => bc.has(x))) {
      const x = ac.get(n)!, y = bc.get(n)!;
      if (x.pk !== y.pk || x.fk !== y.fk) changed.push({ column: n, was: keyStr(x), now: keyStr(y) });
    }
    if (added.length || removed.length || changed.length) columnChanges.push({ table: t, added, removed, changed });
  }

  const relKey = (r: { from: string; to: string }) => `${r.from}->${erd.resolveTable(b, r.to) || r.to}`;
  const ar = new Set(a.rels.map(relKey));
  const br = new Set(b.rels.map(relKey));
  const addedRels = [...br].filter((r) => !ar.has(r));
  const removedRels = [...ar].filter((r) => !br.has(r));

  const stale = !!(addedTables.length || removedTables.length || columnChanges.length || addedRels.length || removedRels.length);
  return { stale, addedTables, removedTables, columnChanges, addedRels, removedRels };
}

function keyStr(c: { pk: boolean; fk: boolean }): string {
  return [c.pk ? "PK" : "", c.fk ? "FK" : ""].filter(Boolean).join(",") || "-";
}

export function report(d: DriftResult): string {
  if (!d.stale) return "In sync. The diagram matches the current schema.";
  const out = ["Diagram is stale. It drifted from the current schema:"];
  if (d.addedTables.length) out.push(`  + tables added since: ${d.addedTables.join(", ")}`);
  if (d.removedTables.length) out.push(`  - tables removed since: ${d.removedTables.join(", ")}`);
  for (const c of d.columnChanges) {
    const bits: string[] = [];
    if (c.added.length) bits.push(`+${c.added.join(" +")}`);
    if (c.removed.length) bits.push(`-${c.removed.join(" -")}`);
    if (c.changed.length) bits.push(c.changed.map((x) => `${x.column}(${x.was}→${x.now})`).join(" "));
    out.push(`  ~ ${c.table}: ${bits.join(" ")}`);
  }
  if (d.addedRels.length) out.push(`  + relations added: ${d.addedRels.join(", ")}`);
  if (d.removedRels.length) out.push(`  - relations removed: ${d.removedRels.join(", ")}`);
  return out.join("\n");
}
