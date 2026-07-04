/**
 * Self-driving demo for the README / social recording (VHS). Deterministic,
 * key-free. Runs the REAL erdlens engine: schema -> ERD, then a migration ->
 * drift. Run: node examples/demo.mjs
 */
import * as erd from "../dist/model/erd.js";
import * as drift from "../dist/model/drift.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", b: "\x1b[1m",
  blue: "\x1b[38;5;111m", green: "\x1b[38;5;42m", red: "\x1b[38;5;203m", grey: "\x1b[90m",
};
async function line(s = "", d = 40) { process.stdout.write(s + "\n"); await sleep(d); }

const SQL = `CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);
CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors(id));`;

async function main() {
  await line(`${C.blue}${C.b}  erdlens${C.reset} ${C.dim}— schema in, ER diagram in your docs${C.reset}\n`, 400);

  await line(`${C.grey}  db/schema.sql:${C.reset}`);
  await line(`${C.dim}    CREATE TABLE authors (id ... , email TEXT UNIQUE);${C.reset}`);
  await line(`${C.dim}    CREATE TABLE posts   (id ... , author_id REFERENCES authors(id));${C.reset}\n`, 500);

  await line(`${C.blue}  › schema_to_erd${C.reset}\n`, 300);
  const mmd = erd.schemaToMermaid(SQL, "sql");
  for (const l of mmd.split("\n")) await line(`  ${C.green}${l}${C.reset}`, 45);
  await line("");
  await line(`${C.grey}  → written into docs/schema.md. No copy-paste.${C.reset}\n`, 600);

  // migration adds a table -> drift
  await line(`${C.grey}  someone runs a migration...${C.reset}`, 400);
  const NEW = SQL + "\nCREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT);";
  await line(`${C.blue}  › drift_check docs/schema.md db/schema.sql${C.reset}\n`, 300);
  const d = drift.diff(mmd, NEW, { currentSource: "sql" });
  for (const l of drift.report(d).split("\n")) await line(`  ${C.red}${l}${C.reset}`, 60);
  await line("");
}
main();
