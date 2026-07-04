/**
 * Showcase reel for social / GitHub. Runs the REAL erdlens engine and narrates the
 * three things it does: schema -> ERD, workflow -> flowchart, and drift after a
 * migration. Deterministic, key-free. Recorded with VHS (see showcase.tape).
 */
import * as erd from "../dist/model/erd.js";
import * as drift from "../dist/model/drift.js";
import * as flow from "../dist/model/flow.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", b: "\x1b[1m",
  blue: "\x1b[38;5;111m", cyan: "\x1b[38;5;117m", green: "\x1b[38;5;42m",
  red: "\x1b[38;5;203m", grey: "\x1b[90m", amber: "\x1b[38;5;221m",
};
async function line(s = "", d = 35) { process.stdout.write(s + "\n"); await sleep(d); }
async function block(mmd, color) { for (const l of mmd.split("\n")) await line(`  ${color}${l}${C.reset}`, 30); }

async function main() {
  await line(`${C.blue}${C.b}  erdlens${C.reset} ${C.dim}— diagrams from your schema, straight into your docs${C.reset}`, 300);
  await line(`${C.grey}  an MCP server for Claude Code. no copy-paste. zero deps.${C.reset}\n`, 500);

  // 1) schema -> ERD
  await line(`${C.cyan}${C.b}1 · database schema  →  ER diagram${C.reset}`, 300);
  const SQL = `CREATE TABLE authors (id INTEGER PRIMARY KEY, email TEXT UNIQUE);
CREATE TABLE posts (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES authors(id));
CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER REFERENCES posts(id));`;
  await line(`${C.dim}  $ erdlens erd db/schema.sql${C.reset}\n`, 300);
  await block(erd.schemaToMermaid(SQL, "sql"), C.green);
  await line(`${C.grey}  ↳ SQL · Prisma · Drizzle · TypeORM · SQLAlchemy${C.reset}\n`, 600);

  // 2) workflow -> flowchart
  await line(`${C.cyan}${C.b}2 · workflow spec  →  flowchart${C.reset}`, 300);
  const WF = `start -> draft
draft -> review
review -> publish : approved
review -> draft : changes
publish -> done`;
  await line(`${C.dim}  $ erdlens flow publish.flow${C.reset}\n`, 300);
  await block(flow.flowToMermaid(WF, "dsl", {}), C.green);
  await line("", 500);

  // 3) drift
  await line(`${C.cyan}${C.b}3 · someone runs a migration  →  drift caught${C.reset}`, 300);
  await line(`${C.dim}  $ erdlens drift docs/schema.mmd db/schema.sql${C.reset}\n`, 300);
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const NEW = SQL + "\nCREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT);";
  await block(drift.report(drift.diff(mmd, NEW, { currentSource: "sql" })), C.red);
  await line("", 400);

  await line(`${C.blue}  claude mcp add erdlens -- npx -y github:ryanda9910/erdlens${C.reset}\n`, 400);
}
main();
