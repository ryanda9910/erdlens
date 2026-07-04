/* erdlens drift — compare a diagram that's embedded in a doc against the current
 * schema, and report what drifted. This is the piece no existing tool does: it
 * catches the ERD in your README going stale after a migration.
 *
 * Two inputs, both become a schema model (via erd.parse):
 *   - the "doc" side: either a Mermaid erDiagram (parsed back to a model) or a
 *     saved schema snapshot.
 *   - the "current" side: the live schema source (SQL/Prisma/etc).
 * Output: added/removed tables, added/removed columns per table, relation
 * changes, and a boolean `stale`.
 */
(function (root) {
  "use strict";
  const erd = (typeof require !== "undefined") ? require("./erd.cjs") : root.erdlens;

  // parse a Mermaid erDiagram back into the schema model, so a doc's diagram can
  // be diffed against source without a DB. Only the structure we emit.
  function parseMermaid(mmd) {
    const sch = erd.emptySchema();
    const lines = String(mmd).split("\n");
    let cur = null;
    for (let raw of lines) {
      const line = raw.trim();
      if (!line || /^erDiagram/i.test(line)) continue;
      // relation line: A ||--o{ B : "..."
      const rel = line.match(/^(\w+)\s+([|}omp{<>o.-]+)\s+(\w+)\s*:/);
      if (rel && !cur) {
        const kind = /[}{]o--o[}{]/.test(rel[2]) ? "N-N" : /\|\|--\|\|/.test(rel[2]) ? "1-1" : "1-N";
        sch.rels.push({ from: rel[1], to: rel[3], kind });
        continue;
      }
      // entity open: Name {
      const open = line.match(/^(\w+)\s*\{$/);
      if (open) { cur = open[1]; sch.tables[cur] = { columns: [] }; continue; }
      if (line === "}") { cur = null; continue; }
      // column: type name PK,FK
      if (cur) {
        const cm = line.match(/^(\w+)\s+(\w+)(?:\s+([\w,]+))?$/);
        if (cm) {
          const marks = (cm[3] || "").split(",");
          sch.tables[cur].columns.push({
            name: cm[2], type: cm[1].toUpperCase(),
            pk: marks.includes("PK"), fk: marks.includes("FK"),
            unique: marks.includes("UK"), nullable: true,
          });
        }
      }
    }
    return sch;
  }

  // coerce either side into a schema model
  function toSchema(input, source) {
    if (input && typeof input === "object" && input.tables) return input; // already a model
    const s = String(input);
    if (/^\s*erDiagram/m.test(s)) return parseMermaid(s);
    return erd.parse(s, source);
  }

  function diff(docSide, currentSide, opts) {
    opts = opts || {};
    const a = toSchema(docSide, opts.docSource || "auto");     // what the doc says
    const b = toSchema(currentSide, opts.currentSource || "auto"); // what's true now

    const at = new Set(Object.keys(a.tables));
    const bt = new Set(Object.keys(b.tables));
    const addedTables = [...bt].filter((t) => !at.has(t));
    const removedTables = [...at].filter((t) => !bt.has(t));

    const columnChanges = [];
    for (const t of [...at].filter((x) => bt.has(x))) {
      const ac = new Map(a.tables[t].columns.map((c) => [c.name, c]));
      const bc = new Map(b.tables[t].columns.map((c) => [c.name, c]));
      const added = [...bc.keys()].filter((n) => !ac.has(n));
      const removed = [...ac.keys()].filter((n) => !bc.has(n));
      const changed = [];
      for (const n of [...ac.keys()].filter((x) => bc.has(x))) {
        const x = ac.get(n), y = bc.get(n);
        if (x.pk !== y.pk || x.fk !== y.fk) changed.push({ column: n, was: keyStr(x), now: keyStr(y) });
      }
      if (added.length || removed.length || changed.length) columnChanges.push({ table: t, added, removed, changed });
    }

    const relKey = (r) => `${r.from}->${erd.resolveTable(b, r.to) || r.to}`;
    const ar = new Set(a.rels.map(relKey));
    const br = new Set(b.rels.map(relKey));
    const addedRels = [...br].filter((r) => !ar.has(r));
    const removedRels = [...ar].filter((r) => !br.has(r));

    const stale = !!(addedTables.length || removedTables.length || columnChanges.length || addedRels.length || removedRels.length);
    return { stale, addedTables, removedTables, columnChanges, addedRels, removedRels };
  }

  function keyStr(c) { return [c.pk ? "PK" : "", c.fk ? "FK" : ""].filter(Boolean).join(",") || "-"; }

  // human-readable drift summary
  function report(d) {
    if (!d.stale) return "In sync. The diagram matches the current schema.";
    const out = ["Diagram is stale. It drifted from the current schema:"];
    if (d.addedTables.length) out.push(`  + tables added since: ${d.addedTables.join(", ")}`);
    if (d.removedTables.length) out.push(`  - tables removed since: ${d.removedTables.join(", ")}`);
    for (const c of d.columnChanges) {
      const bits = [];
      if (c.added.length) bits.push(`+${c.added.join(" +")}`);
      if (c.removed.length) bits.push(`-${c.removed.join(" -")}`);
      if (c.changed.length) bits.push(c.changed.map((x) => `${x.column}(${x.was}→${x.now})`).join(" "));
      out.push(`  ~ ${c.table}: ${bits.join(" ")}`);
    }
    if (d.addedRels.length) out.push(`  + relations added: ${d.addedRels.join(", ")}`);
    if (d.removedRels.length) out.push(`  - relations removed: ${d.removedRels.join(", ")}`);
    return out.join("\n");
  }

  const api = { diff, report, parseMermaid, toSchema };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.erdlensDrift = api;
})(typeof window !== "undefined" ? window : this);
