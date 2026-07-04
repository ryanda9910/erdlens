/* erdlens core — turn a schema into a Mermaid erDiagram. Zero runtime dependencies.
 *
 * Sources (autodetected or explicit): SQL DDL, Prisma, Drizzle, TypeORM, SQLAlchemy.
 * Output: a Mermaid `erDiagram` string, via a Schema model that drift-check can diff.
 */
import type { Column, Schema, SchemaSource } from "./types.js";

export function emptySchema(): Schema {
  return { tables: {}, rels: [] };
}

// ── source detection ──
export function detect(src: string): Exclude<SchemaSource, "auto"> {
  const s = String(src || "");
  if (/^\s*model\s+\w+\s*\{/m.test(s) && /@id|@relation|String|Int|Boolean/.test(s)) return "prisma";
  if (/pgTable\s*\(|mysqlTable\s*\(|sqliteTable\s*\(/.test(s)) return "drizzle";
  if (/@Entity\s*\(|@Column\s*\(|@PrimaryGeneratedColumn/.test(s)) return "typeorm";
  if (/__tablename__\s*=|Column\s*\(|relationship\s*\(/.test(s) && /class\s+\w+\s*\(/.test(s)) return "sqlalchemy";
  return "sql";
}

export function parse(src: string, source?: SchemaSource): Schema {
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
function parseSQL(src: string): Schema {
  const sch = emptySchema();
  const s = src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([\w.]+)[`"\]]?\s*\(([\s\S]*?)\)\s*;?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const table = clean(m[1]!);
    const cols: Column[] = [];
    for (const raw of splitTopLevel(m[2]!)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^PRIMARY\s+KEY/i.test(line)) {
        const c = (line.match(/\(([^)]*)\)/) || [])[1];
        if (c) c.split(",").forEach((n) => markPK(cols, clean(n)));
        continue;
      }
      if (/^FOREIGN\s+KEY/i.test(line)) {
        const col = clean(((line.match(/FOREIGN\s+KEY\s*\(([^)]*)\)/i) || [])[1] || "").split(",")[0]!);
        const ref = line.match(/REFERENCES\s+[`"[]?([\w.]+)[`"\]]?/i);
        if (col) markFK(cols, col);
        if (col && ref) sch.rels.push({ from: table, to: clean(ref[1]!), kind: "1-N" });
        continue;
      }
      if (/^(CONSTRAINT|UNIQUE|CHECK|KEY|INDEX)\b/i.test(line)) continue;
      const cm = line.match(/^[`"[]?([\w]+)[`"\]]?\s+([A-Za-z][\w]*(?:\s*\([^)]*\))?)/);
      if (!cm) continue;
      const col: Column = {
        name: cm[1]!,
        type: cm[2]!.replace(/\s+/g, "").toUpperCase(),
        pk: /PRIMARY\s+KEY/i.test(line),
        fk: false,
        nullable: !/NOT\s+NULL/i.test(line),
        unique: /\bUNIQUE\b/i.test(line),
      };
      const iref = line.match(/REFERENCES\s+[`"[]?([\w.]+)[`"\]]?/i);
      if (iref) { col.fk = true; sch.rels.push({ from: table, to: clean(iref[1]!), kind: "1-N" }); }
      cols.push(col);
    }
    sch.tables[table] = { columns: cols };
  }
  return sch;
}

// ── Prisma ──
function parsePrisma(src: string): Schema {
  const sch = emptySchema();
  const models = blocks(src, /model\s+(\w+)\s*/g);
  const modelNames = new Set(models.map((b) => b.name));
  for (const blk of models) {
    const table = blk.name;
    const cols: Column[] = [];
    for (const line of blk.body.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
      const fm = t.match(/^(\w+)\s+([\w[\]?.]+)(.*)$/);
      if (!fm) continue;
      const [, name, typeRaw, rest] = fm as unknown as [string, string, string, string];
      const baseType = typeRaw.replace(/[[\]?]/g, "");
      if (modelNames.has(baseType)) {
        sch.rels.push({ from: table, to: baseType, kind: /\[\]/.test(typeRaw) ? "1-N" : "1-1" });
        continue;
      }
      cols.push({
        name, type: baseType.toUpperCase(),
        pk: /@id/.test(rest), fk: /@relation/.test(rest),
        nullable: /\?/.test(typeRaw), unique: /@unique/.test(rest),
      });
    }
    sch.tables[table] = { columns: cols };
  }
  return sch;
}

// ── Drizzle ──
function parseDrizzle(src: string): Schema {
  const sch = emptySchema();
  const re = /(?:pg|mysql|sqlite)Table\s*\(\s*["'`](\w+)["'`]\s*,\s*\{([\s\S]*?)\}\s*(?:,[\s\S]*?)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const table = m[1]!;
    const cols: Column[] = [];
    for (const line of m[2]!.split("\n")) {
      const t = line.trim().replace(/,$/, "");
      if (!t) continue;
      const fm = t.match(/^(\w+)\s*:\s*(\w+)\s*\(([\s\S]*)\)/);
      if (!fm) continue;
      const [, name, typeFn] = fm as unknown as [string, string, string];
      const col: Column = {
        name, type: typeFn.toUpperCase(),
        pk: /\.primaryKey\s*\(/.test(t), fk: /\.references\s*\(/.test(t),
        nullable: !/\.notNull\s*\(/.test(t), unique: /\.unique\s*\(/.test(t),
      };
      const ref = t.match(/\.references\s*\(\s*\(\)\s*=>\s*(\w+)\./);
      if (ref) sch.rels.push({ from: table, to: ref[1]!, kind: "1-N" });
      cols.push(col);
    }
    sch.tables[table] = { columns: cols };
  }
  return sch;
}

// ── TypeORM ──
function parseTypeORM(src: string): Schema {
  const sch = emptySchema();
  const hdr = /@Entity\s*\(([^)]*)\)\s*(?:export\s+)?class\s+(\w+)\s*/g;
  let m: RegExpExecArray | null;
  while ((m = hdr.exec(src))) {
    const nameArg = (m[1]!.match(/["'`](\w+)["'`]/) || [])[1];
    const table = nameArg || m[2]!;
    let i = hdr.lastIndex;
    while (i < src.length && src[i] !== "{") i++;
    if (src[i] !== "{") continue;
    let depth = 0; const start = i;
    for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (!depth) { i++; break; } } }
    const body = src.slice(start + 1, i - 1);
    hdr.lastIndex = i;
    const cols: Column[] = [];
    const cre = /@(PrimaryGeneratedColumn|PrimaryColumn|Column)\s*\(([^)]*)\)\s*(\w+)\s*[:!?]/g;
    let cm: RegExpExecArray | null;
    while ((cm = cre.exec(body))) {
      cols.push({
        name: cm[3]!,
        type: ((cm[2]!.match(/["'`](\w+)["'`]/) || [])[1] || "").toUpperCase() || "COLUMN",
        pk: /Primary/.test(cm[1]!), fk: false,
        nullable: /nullable\s*:\s*true/.test(cm[2]!), unique: /unique\s*:\s*true/.test(cm[2]!),
      });
    }
    const rre = /@(ManyToOne|OneToMany|OneToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rre.exec(body))) {
      const kind = rm[1] === "ManyToMany" ? "N-N" : rm[1] === "OneToOne" ? "1-1" : "1-N";
      sch.rels.push({ from: table, to: rm[2]!, kind });
    }
    sch.tables[table] = { columns: cols };
  }
  return sch;
}

// ── SQLAlchemy ──
function parseSQLAlchemy(src: string): Schema {
  const sch = emptySchema();
  const heads: { name: string; start: number; bodyStart: number }[] = [];
  const hre = /^class\s+(\w+)\s*\([^)]*\)\s*:/gm;
  let h: RegExpExecArray | null;
  while ((h = hre.exec(src))) heads.push({ name: h[1]!, start: h.index, bodyStart: hre.lastIndex });
  for (let i = 0; i < heads.length; i++) {
    const cls = heads[i]!.name;
    const body = src.slice(heads[i]!.bodyStart, i + 1 < heads.length ? heads[i + 1]!.start : src.length);
    const tn = body.match(/__tablename__\s*=\s*["'`](\w+)["'`]/);
    const table = tn ? tn[1]! : cls;
    const cols: Column[] = [];
    const cre = /(\w+)\s*=\s*(?:mapped_column|Column)\s*\(([\s\S]*?)\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cre.exec(body))) {
      const name = cm[1]!, args = cm[2]!;
      const typeM = args.match(/(Integer|String|Text|Boolean|DateTime|Date|Float|Numeric|BigInteger|JSON|UUID)/i);
      cols.push({
        name, type: (typeM ? typeM[1]! : "COLUMN").toUpperCase(),
        pk: /primary_key\s*=\s*True/.test(args), fk: /ForeignKey\s*\(/.test(args),
        nullable: !/nullable\s*=\s*False/.test(args), unique: /unique\s*=\s*True/.test(args),
      });
      const ref = args.match(/ForeignKey\s*\(\s*["'`](\w+)\./);
      if (ref) sch.rels.push({ from: table, to: ref[1]!, kind: "1-N" });
    }
    const rre = /(\w+)\s*=\s*relationship\s*\(\s*["'`]?(\w+)/g;
    let rm: RegExpExecArray | null;
    while ((rm = rre.exec(body))) sch.rels.push({ from: table, to: rm[2]!.toLowerCase(), kind: "1-N" });
    if (cols.length) sch.tables[table] = { columns: cols };
  }
  return sch;
}

// ── render schema -> Mermaid erDiagram ──
export function toMermaid(sch: Schema): string {
  const lines = ["erDiagram"];
  const seenRel = new Set<string>();
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

export function resolveTable(sch: Schema, ref: string): string | null {
  if (sch.tables[ref]) return ref;
  const lower = String(ref).toLowerCase();
  for (const t of Object.keys(sch.tables)) {
    if (t.toLowerCase() === lower) return t;
    if (t.toLowerCase() === lower + "s" || t.toLowerCase() + "s" === lower) return t;
  }
  return null;
}

export function schemaToMermaid(src: string, source?: SchemaSource): string {
  return toMermaid(parse(src, source));
}

// ── helpers ──
function clean(s: string): string { return String(s || "").replace(/[`"[\]]/g, "").trim(); }
function markPK(cols: Column[], name: string): void { const c = cols.find((x) => x.name === name); if (c) c.pk = true; }
function markFK(cols: Column[], name: string): void { const c = cols.find((x) => x.name === name); if (c) c.fk = true; }

// balanced `{ ... }` blocks following a header regex
function blocks(src: string, headerRe: RegExp): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  headerRe.lastIndex = 0;
  while ((m = headerRe.exec(src))) {
    let i = headerRe.lastIndex;
    while (i < src.length && src[i] !== "{") i++;
    if (src[i] !== "{") continue;
    let depth = 0; const start = i;
    for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}") { depth--; if (depth === 0) { i++; break; } } }
    out.push({ name: m[1]!, body: src.slice(start + 1, i - 1) });
    headerRe.lastIndex = i;
  }
  return out;
}

function splitTopLevel(body: string): string[] {
  const out: string[] = []; let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
