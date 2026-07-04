/* erdlens ViewModel — self-improving loop (loop-designer: maker → checker → reflect).
 *   MAKER   : run every parser on its fixture + a drift scenario, log trajectories.
 *   CHECKER : independent grade — a source that passed before and fails now is a regression.
 *   REFLECT : persist per-source pass state so the next cycle can spot regressions.
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as erd from "../model/erd.js";
import * as drift from "../model/drift.js";
import * as flow from "../model/flow.js";
import type { SchemaSource } from "../model/types.js";

const DIR = join(homedir(), ".erdlens");
export const LOG = join(DIR, "learn.jsonl");
export const MEM = join(DIR, "memory.json");

interface Fixture { source: Exclude<SchemaSource, "auto">; text: string; expect: { tables: string[]; rel: [string, string] }; }

export const FIXTURES: Fixture[] = [
  { source: "sql", text: `CREATE TABLE a (id INTEGER PRIMARY KEY);\nCREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a(id));`, expect: { tables: ["a", "b"], rel: ["b", "a"] } },
  { source: "prisma", text: `model A { id Int @id\n bs B[] }\nmodel B { id Int @id\n a A @relation(fields:[aId],references:[id])\n aId Int }`, expect: { tables: ["A", "B"], rel: ["A", "B"] } },
  { source: "drizzle", text: `export const a = pgTable("a", { id: serial("id").primaryKey() });\nexport const b = pgTable("b", { id: serial("id").primaryKey(), aId: integer("a_id").references(() => a.id) });`, expect: { tables: ["a", "b"], rel: ["b", "a"] } },
  { source: "typeorm", text: `@Entity("a") export class A { @PrimaryGeneratedColumn() id: number; @OneToMany(() => B) bs: B[]; }`, expect: { tables: ["a"], rel: ["a", "B"] } },
  { source: "sqlalchemy", text: `class A(Base):\n    __tablename__ = "a"\n    id = Column(Integer, primary_key=True)\n\nclass B(Base):\n    __tablename__ = "b"\n    id = Column(Integer, primary_key=True)\n    a_id = Column(Integer, ForeignKey("a.id"))`, expect: { tables: ["a", "b"], rel: ["b", "a"] } },
];

interface Memory { sources: Record<string, { lastOk: boolean; pass: number; fail: number }>; drift?: { lastOk: boolean }; flow?: { lastOk: boolean }; cycles?: number; }

function ensureDir(): void { try { mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ } }
function logTrajectory(rec: Record<string, unknown>): void { try { ensureDir(); appendFileSync(LOG, JSON.stringify({ ...rec, at: "cycle" }) + "\n"); } catch { /* ignore */ } }
function loadMemory(): Memory { try { return JSON.parse(readFileSync(MEM, "utf8")) as Memory; } catch { return { sources: {} }; } }
function saveMemory(m: Memory): void { try { ensureDir(); const tmp = MEM + ".tmp"; writeFileSync(tmp, JSON.stringify(m, null, 2)); renameSync(tmp, MEM); } catch { /* ignore */ } }

export interface TuneResult { text: string; pass: boolean; regressions: string[]; }

export function tune(): TuneResult {
  const out = ["erdlens tune — self-improving loop", "=".repeat(40)];
  const before = loadMemory().sources;

  out.push("", "1/3 maker — parse every source + drift…");
  const results: { source: string; ok: boolean; why: string }[] = [];
  for (const f of FIXTURES) {
    let ok = true, why = "";
    try {
      const s = erd.parse(f.text, f.source);
      const tables = Object.keys(s.tables);
      const hasTables = f.expect.tables.every((t) => tables.includes(t));
      const hasRel = s.rels.some((r) => r.from === f.expect.rel[0] && (erd.resolveTable(s, r.to) === f.expect.rel[1] || r.to === f.expect.rel[1]));
      if (!hasTables) { ok = false; why = `missing tables (got ${tables.join(",")})`; }
      else if (!hasRel) { ok = false; why = `missing relation ${f.expect.rel.join("->")}`; }
    } catch (e) { ok = false; why = (e as Error).message; }
    logTrajectory({ phase: "parse", source: f.source, ok, why });
    results.push({ source: f.source, ok, why });
  }

  let driftOk = true, driftWhy = "";
  try {
    const base = FIXTURES[0]!.text;
    const mmd = erd.schemaToMermaid(base, "sql");
    const inSync = drift.diff(mmd, base, { currentSource: "sql" });
    const stale = drift.diff(mmd, base + "\nCREATE TABLE c (id INTEGER PRIMARY KEY);", { currentSource: "sql" });
    if (inSync.stale) { driftOk = false; driftWhy = "false-positive: matching diagram reported stale"; }
    else if (!stale.stale || !stale.addedTables.includes("c")) { driftOk = false; driftWhy = "missed a planted new table"; }
  } catch (e) { driftOk = false; driftWhy = (e as Error).message; }
  logTrajectory({ phase: "drift", ok: driftOk, why: driftWhy });

  let flowOk = true;
  try { flowOk = /flowchart/.test(flow.flowToMermaid("a -> b : go", "dsl", {})); } catch { flowOk = false; }
  logTrajectory({ phase: "flow", ok: flowOk });

  const okN = results.filter((r) => r.ok).length;
  out.push(`   ${okN}/${results.length} sources parsed · drift ${driftOk ? "ok" : "FAIL"} · flow ${flowOk ? "ok" : "FAIL"}`);
  for (const r of results) if (!r.ok) out.push(`     ✗ ${r.source}: ${r.why}`);
  if (!driftOk) out.push(`     ✗ drift: ${driftWhy}`);

  out.push("", "2/3 checker — grade (regresi = dulu lulus, kini gagal)…");
  const regressions: string[] = [];
  for (const r of results) {
    const prev = before[r.source];
    if (prev && prev.lastOk && !r.ok) regressions.push(`${r.source}: passed before, now fails — ${r.why}`);
  }
  const allGreen = okN === results.length && driftOk && flowOk;
  if (regressions.length) { out.push("   REGRESSIONS:"); regressions.forEach((x) => out.push("     ! " + x)); }
  else out.push(`   no regressions. cycle ${allGreen ? "GREEN" : "has failures (not regressions)"}.`);

  out.push("", "3/3 reflect — simpan memory…");
  const prevMem = loadMemory();
  const mem: Memory = { sources: {}, drift: { lastOk: driftOk }, flow: { lastOk: flowOk }, cycles: (prevMem.cycles || 0) + 1 };
  for (const r of results) {
    const prev = before[r.source] || { pass: 0, fail: 0, lastOk: false };
    mem.sources[r.source] = { lastOk: r.ok, pass: prev.pass + (r.ok ? 1 : 0), fail: prev.fail + (r.ok ? 0 : 1) };
  }
  saveMemory(mem);
  out.push(`   memory: ${MEM} (cycle ${mem.cycles})`);
  out.push("", allGreen ? "PASS — all sources, drift, and flow healthy." : "ATTENTION — see failures above.");

  return { text: out.join("\n"), pass: allGreen && regressions.length === 0, regressions };
}
