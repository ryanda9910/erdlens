/* erdlens core — turn a schema into a Mermaid erDiagram. Zero dependencies.
 *
 * Input sources (autodetected or explicit):
 *   - SQL DDL           (CREATE TABLE ...)
 *   - Prisma schema     (model X { ... })
 *   - Drizzle (pgTable/mysqlTable/sqliteTable("x", { ... }))
 *   - TypeORM entities  (@Entity ... @Column ... @ManyToOne ...)
 *   - SQLAlchemy models (class X(Base): __tablename__ = ...; Column(...))
 *
 * Output: a Mermaid `erDiagram` string (entities + columns w/ PK/FK, relations).
 * A schema model in between so drift-check can diff two schemas structurally.
 *
 * Runs in Node (module.exports) and in a browser (global erdlens).
 */
(function (root) {
  "use strict";

  // ── schema model ──
  // { tables: { name: { columns: [{name,type,pk,fk,nullable,unique}], } },
  //   rels: [{from, to, kind}] }  kind: "1-1" | "1-N" | "N-N"
  function emptySchema() { return { tables: {}, rels: [] }; }

  // ── source detection ──
  function detect(src) {
    const s = String(src || "");
    if (/^\s*model\s+\w+\s*\{/m.test(s) && /@id|@relation|String|Int|Boolean/.test(s)) return "prisma";
    if (/pgTable\s*\(|mysqlTable\s*\(|sqliteTable\s*\(/.test(s)) return "drizzle";
    if (/@Entity\s*\(|@Column\s*\(|@PrimaryGeneratedColumn/.test(s)) return "typeorm";
    if (/__tablename__\s*=|Column\s*\(|relationship\s*\(/.test(s) && /class\s+\w+\s*\(/.test(s)) return "sqlalchemy";
    if (/CREATE\s+TABLE/i.test(s)) return "sql";
    return "sql"; // default
  }

  function parse(src, source) {
    const kind = source && source !== "auto" ? source : detect(src);
    switch (kind) {
      case "prisma": return parsePrisma(src);
      case "drizzle": return parseDrizzle(src);
      case "typeorm": return parseTypeORM(src);
      case "sqlalchemy": return parseSQLAlchemy(src);
      default: return parseSQL(src);
    }
  }

  // ── SQL DDL ──
  function parseSQL(src) {
    const sch = emptySchema();
    // strip line + block comments
    const s = src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([\w.]+)[`"\]]?\s*\(([\s\S]*?)\)\s*;?/gi;
    let m;
    while ((m = re.exec(s))) {
      const table = clean(m[1]);
      const body = m[2];
      const cols = [];
      const parts = splitTopLevel(body);
      for (const raw of parts) {
        const line = raw.trim();
        if (!line) continue;
        // table-level constraints
        if (/^PRIMARY\s+KEY/i.test(line)) {
          const c = (line.match(/\(([^)]*)\)/) || [])[1];
          if (c) c.split(",").forEach((n) => markPK(cols, clean(n)));
          continue;
        }
        if (/^FOREIGN\s+KEY/i.test(line)) {
          const col = clean(((line.match(/FOREIGN\s+KEY\s*\(([^)]*)\)/i) || [])[1] || "").split(",")[0]);
          const ref = line.match(/REFERENCES\s+[`"[]?([\w.]+)[`"\]]?/i);
          if (col) markFK(cols, col);
          if (col && ref) sch.rels.push({ from: table, to: clean(ref[1]), kind: "1-N" });
          continue;
        }
        if (/^(CONSTRAINT|UNIQUE|CHECK|KEY|INDEX)\b/i.test(line)) continue;
        // a column def
        const cm = line.match(/^[`"[]?([\w]+)[`"\]]?\s+([A-Za-z][\w]*(?:\s*\([^)]*\))?)/);
        if (!cm) continue;
        const col = {
          name: cm[1],
          type: cm[2].replace(/\s+/g, "").toUpperCase(),
          pk: /PRIMARY\s+KEY/i.test(line),
          fk: false,
          nullable: !/NOT\s+NULL/i.test(line),
          unique: /\bUNIQUE\b/i.test(line),
        };
        // inline REFERENCES
        const iref = line.match(/REFERENCES\s+[`"[]?([\w.]+)[`"\]]?/i);
        if (iref) { col.fk = true; sch.rels.push({ from: table, to: clean(iref[1]), kind: "1-N" }); }
        cols.push(col);
      }
      sch.tables[table] = { columns: cols };
    }
    return sch;
  }

  // ── Prisma ──
  function parsePrisma(src) {
    const sch = emptySchema();
    const re = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let m;
    const modelNames = new Set();
    // first pass: collect model names so we can spot relation fields
    let mm; const scan = /model\s+(\w+)\s*\{/g;
    while ((mm = scan.exec(src))) modelNames.add(mm[1]);
    while ((m = re.exec(src))) {
      const table = m[1];
      const cols = [];
      for (const line of m[2].split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
        const fm = t.match(/^(\w+)\s+([\w\[\]?.]+)(.*)$/);
        if (!fm) continue;
        const [, name, typeRaw, rest] = fm;
        const baseType = typeRaw.replace(/[\[\]?]/g, "");
        // a relation field: type is another model
        if (modelNames.has(baseType)) {
          const isList = /\[\]/.test(typeRaw);
          sch.rels.push({ from: table, to: baseType, kind: isList ? "1-N" : "1-1" });
          continue; // relation object field, not a column
        }
        cols.push({
          name,
          type: baseType.toUpperCase(),
          pk: /@id/.test(rest),
          fk: /@relation/.test(rest),
          nullable: /\?/.test(typeRaw),
          unique: /@unique/.test(rest),
        });
      }
      sch.tables[table] = { columns: cols };
    }
    return sch;
  }

  // ── Drizzle ──
  function parseDrizzle(src) {
    const sch = emptySchema();
    const re = /(?:pg|mysql|sqlite)Table\s*\(\s*["'`](\w+)["'`]\s*,\s*\{([\s\S]*?)\}\s*(?:,[\s\S]*?)?\)/g;
    let m;
    while ((m = re.exec(src))) {
      const table = m[1];
      const cols = [];
      for (const line of m[2].split("\n")) {
        const t = line.trim().replace(/,$/, "");
        if (!t) continue;
        const fm = t.match(/^(\w+)\s*:\s*(\w+)\s*\(([\s\S]*)\)/);
        if (!fm) continue;
        const [, name, typeFn, args] = fm;
        const col = {
          name,
          type: typeFn.toUpperCase(),
          pk: /\.primaryKey\s*\(/.test(t),
          fk: /\.references\s*\(/.test(t),
          nullable: !/\.notNull\s*\(/.test(t),
          unique: /\.unique\s*\(/.test(t),
        };
        const ref = t.match(/\.references\s*\(\s*\(\)\s*=>\s*(\w+)\./);
        if (ref) sch.rels.push({ from: table, to: ref[1], kind: "1-N" });
        cols.push(col);
      }
      sch.tables[table] = { columns: cols };
    }
    return sch;
  }

  // ── TypeORM ──
  function parseTypeORM(src) {
    const sch = emptySchema();
    const re = /@Entity\s*\(([^)]*)\)\s*(?:export\s+)?class\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
    let m;
    while ((m = re.exec(src))) {
      const nameArg = (m[1].match(/["'`](\w+)["'`]/) || [])[1];
      const table = nameArg || m[2];
      const body = m[3];
      const cols = [];
      // columns: @PrimaryGeneratedColumn / @Column decorators followed by a field
      const cre = /@(PrimaryGeneratedColumn|PrimaryColumn|Column)\s*\(([^)]*)\)\s*(\w+)\s*[:!?]/g;
      let cm;
      while ((cm = cre.exec(body))) {
        cols.push({
          name: cm[3],
          type: ((cm[2].match(/["'`](\w+)["'`]/) || [])[1] || "").toUpperCase() || "COLUMN",
          pk: /Primary/.test(cm[1]),
          fk: false,
          nullable: /nullable\s*:\s*true/.test(cm[2]),
          unique: /unique\s*:\s*true/.test(cm[2]),
        });
      }
      // relations
      const rre = /@(ManyToOne|OneToMany|OneToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/g;
      let rm;
      while ((rm = rre.exec(body))) {
        const kind = rm[1] === "ManyToMany" ? "N-N" : rm[1] === "OneToOne" ? "1-1" : "1-N";
        sch.rels.push({ from: table, to: rm[2], kind });
      }
      sch.tables[table] = { columns: cols };
    }
    return sch;
  }

  // ── SQLAlchemy ──
  function parseSQLAlchemy(src) {
    const sch = emptySchema();
    // split into class blocks: each starts at a top-level `class X(...):` and
    // runs until the next top-level class. A single regex with a lookahead is
    // fragile here, so slice on class-header offsets instead.
    const heads = [];
    const hre = /^class\s+(\w+)\s*\([^)]*\)\s*:/gm;
    let h;
    while ((h = hre.exec(src))) heads.push({ name: h[1], start: h.index, bodyStart: hre.lastIndex });
    for (let i = 0; i < heads.length; i++) {
      const cls = heads[i].name;
      const body = src.slice(heads[i].bodyStart, i + 1 < heads.length ? heads[i + 1].start : src.length);
      const tn = body.match(/__tablename__\s*=\s*["'`](\w+)["'`]/);
      const table = tn ? tn[1] : cls;
      const cols = [];
      const cre = /(\w+)\s*=\s*(?:mapped_column|Column)\s*\(([\s\S]*?)\)/g;
      let cm;
      while ((cm = cre.exec(body))) {
        const name = cm[1], args = cm[2];
        const typeM = args.match(/(Integer|String|Text|Boolean|DateTime|Date|Float|Numeric|BigInteger|JSON|UUID)/i);
        const fk = /ForeignKey\s*\(/.test(args);
        cols.push({
          name,
          type: (typeM ? typeM[1] : "COLUMN").toUpperCase(),
          pk: /primary_key\s*=\s*True/.test(args),
          fk,
          nullable: !/nullable\s*=\s*False/.test(args),
          unique: /unique\s*=\s*True/.test(args),
        });
        const ref = args.match(/ForeignKey\s*\(\s*["'`](\w+)\./);
        if (ref) sch.rels.push({ from: table, to: ref[1], kind: "1-N" });
      }
      // relationship()
      const rre = /(\w+)\s*=\s*relationship\s*\(\s*["'`]?(\w+)/g;
      let rm;
      while ((rm = rre.exec(body))) {
        sch.rels.push({ from: table, to: rm[2].toLowerCase(), kind: "1-N" });
      }
      if (cols.length) sch.tables[table] = { columns: cols };
    }
    return sch;
  }

  // ── render schema -> Mermaid erDiagram ──
  function toMermaid(sch) {
    const lines = ["erDiagram"];
    // relations first (Mermaid draws entities referenced here too)
    const seenRel = new Set();
    for (const r of sch.rels) {
      const to = resolveTable(sch, r.to);
      if (!to || !sch.tables[r.from]) continue;
      const key = `${r.from}|${to}|${r.kind}`;
      if (seenRel.has(key)) continue;
      seenRel.add(key);
      const sym = r.kind === "N-N" ? "}o--o{" : r.kind === "1-1" ? "||--||" : "||--o{";
      lines.push(`  ${r.from} ${sym} ${to} : ""`);
    }
    for (const [name, tbl] of Object.entries(sch.tables)) {
      lines.push(`  ${name} {`);
      for (const c of tbl.columns) {
        const marks = [c.pk ? "PK" : "", c.fk ? "FK" : "", c.unique && !c.pk ? "UK" : ""].filter(Boolean).join(",");
        const type = (c.type || "col").replace(/[^\w]/g, "").toLowerCase() || "col";
        lines.push(`    ${type} ${c.name}${marks ? " " + marks : ""}`);
      }
      lines.push("  }");
    }
    return lines.join("\n");
  }

  // resolve a referenced table name loosely (case / singular-plural tolerant)
  function resolveTable(sch, ref) {
    if (sch.tables[ref]) return ref;
    const lower = String(ref).toLowerCase();
    for (const t of Object.keys(sch.tables)) {
      if (t.toLowerCase() === lower) return t;
      if (t.toLowerCase() === lower + "s" || t.toLowerCase() + "s" === lower) return t;
    }
    return null;
  }

  function schemaToMermaid(src, source) { return toMermaid(parse(src, source)); }

  // ── helpers ──
  function clean(s) { return String(s || "").replace(/[`"[\]]/g, "").trim(); }
  function markPK(cols, name) { const c = cols.find((x) => x.name === name); if (c) c.pk = true; }
  function markFK(cols, name) { const c = cols.find((x) => x.name === name); if (c) c.fk = true; }
  // split a CREATE TABLE body on top-level commas (ignore commas inside parens)
  function splitTopLevel(body) {
    const out = []; let depth = 0, cur = "";
    for (const ch of body) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  const api = { parse, detect, toMermaid, schemaToMermaid, emptySchema, resolveTable };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.erdlens = api;
})(typeof window !== "undefined" ? window : this);
