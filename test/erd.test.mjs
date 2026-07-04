import assert from "node:assert";
import * as erd from "../dist/model/erd.js";
import * as drift from "../dist/model/drift.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + "\n      " + e.message); }
}

// ── detection ──
t("detects SQL DDL", () => assert.equal(erd.detect("CREATE TABLE users (id INT)"), "sql"));
t("detects Prisma", () => assert.equal(erd.detect("model User {\n id Int @id\n name String\n}"), "prisma"));
t("detects Drizzle", () => assert.equal(erd.detect(`export const users = pgTable("users", { id: serial("id") })`), "drizzle"));
t("detects TypeORM", () => assert.equal(erd.detect("@Entity()\nclass User { @Column() name: string }"), "typeorm"));
t("detects SQLAlchemy", () => assert.equal(erd.detect("class User(Base):\n  __tablename__ = 'users'\n  id = Column(Integer, primary_key=True)"), "sqlalchemy"));

// ── SQL ──
const SQL = `
CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER REFERENCES authors(id)
);`;
t("SQL: two tables parsed", () => {
  const s = erd.parse(SQL, "sql");
  assert.deepEqual(Object.keys(s.tables).sort(), ["authors", "posts"]);
});
t("SQL: PK detected", () => {
  const s = erd.parse(SQL, "sql");
  assert.ok(s.tables.authors.columns.find((c) => c.name === "id").pk);
});
t("SQL: FK + relation detected", () => {
  const s = erd.parse(SQL, "sql");
  assert.ok(s.tables.posts.columns.find((c) => c.name === "author_id").fk);
  assert.ok(s.rels.find((r) => r.from === "posts" && r.to === "authors"));
});
t("SQL: UNIQUE column flagged", () => {
  const s = erd.parse(SQL, "sql");
  assert.ok(s.tables.authors.columns.find((c) => c.name === "email").unique);
});
t("SQL: mermaid output has entities + relation", () => {
  const m = erd.schemaToMermaid(SQL, "sql");
  assert.ok(m.startsWith("erDiagram"));
  assert.ok(/posts \|\|--o\{ authors/.test(m));
  assert.ok(/integer id PK/.test(m));
});

// ── Prisma ──
const PRISMA = `
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  posts Post[]
}
model Post {
  id       Int    @id
  title    String
  author   User   @relation(fields: [authorId], references: [id])
  authorId Int
}`;
t("Prisma: relation field is not a column", () => {
  const s = erd.parse(PRISMA, "prisma");
  assert.ok(!s.tables.User.columns.find((c) => c.name === "posts"));
});
t("Prisma: 1-N relation from list field", () => {
  const s = erd.parse(PRISMA, "prisma");
  assert.ok(s.rels.find((r) => r.from === "User" && r.to === "Post" && r.kind === "1-N"));
});
t("Prisma: @id + @unique flags", () => {
  const s = erd.parse(PRISMA, "prisma");
  assert.ok(s.tables.User.columns.find((c) => c.name === "id").pk);
  assert.ok(s.tables.User.columns.find((c) => c.name === "email").unique);
});

// ── Drizzle ──
const DRIZZLE = `
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
});
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").references(() => users.id),
});`;
t("Drizzle: tables + pk", () => {
  const s = erd.parse(DRIZZLE, "drizzle");
  assert.ok(s.tables.users.columns.find((c) => c.name === "id").pk);
});
t("Drizzle: references -> relation", () => {
  const s = erd.parse(DRIZZLE, "drizzle");
  assert.ok(s.rels.find((r) => r.from === "posts" && r.to === "users"));
});

// ── TypeORM ──
const TYPEORM = `
@Entity("users")
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) email: string;
  @OneToMany(() => Post) posts: Post[];
}`;
t("TypeORM: PK + relation", () => {
  const s = erd.parse(TYPEORM, "typeorm");
  assert.ok(s.tables.users.columns.find((c) => c.name === "id").pk);
  assert.ok(s.rels.find((r) => r.from === "users" && r.to === "Post" && r.kind === "1-N"));
});

// ── SQLAlchemy ──
const SQLA = `
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)

class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True)
    author_id = Column(Integer, ForeignKey("users.id"))
`;
t("SQLAlchemy: tablename + pk", () => {
  const s = erd.parse(SQLA, "sqlalchemy");
  assert.ok(s.tables.users.columns.find((c) => c.name === "id").pk);
});
t("SQLAlchemy: ForeignKey -> relation", () => {
  const s = erd.parse(SQLA, "sqlalchemy");
  assert.ok(s.rels.find((r) => r.from === "posts" && r.to === "users"));
});

// ── drift: the wedge ──
t("drift: in sync when doc matches schema", () => {
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const d = drift.diff(mmd, SQL, { currentSource: "sql" });
  assert.equal(d.stale, false);
});
t("drift: flags a table added since the diagram", () => {
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const NEW = SQL + "\nCREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT);";
  const d = drift.diff(mmd, NEW, { currentSource: "sql" });
  assert.equal(d.stale, true);
  assert.ok(d.addedTables.includes("tags"));
});
t("drift: flags a column added to an existing table", () => {
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const NEW = SQL.replace("title TEXT NOT NULL,", "title TEXT NOT NULL,\n  published BOOLEAN,");
  const d = drift.diff(mmd, NEW, { currentSource: "sql" });
  assert.equal(d.stale, true);
  const pc = d.columnChanges.find((c) => c.table === "posts");
  assert.ok(pc && pc.added.includes("published"));
});
t("drift: flags a removed table", () => {
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const LESS = "CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);";
  const d = drift.diff(mmd, LESS, { currentSource: "sql" });
  assert.ok(d.removedTables.includes("posts"));
});
t("drift: report reads clearly", () => {
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const NEW = SQL + "\nCREATE TABLE tags (id INTEGER PRIMARY KEY);";
  const r = drift.report(drift.diff(mmd, NEW, { currentSource: "sql" }));
  assert.ok(/stale/i.test(r) && /tags/.test(r));
});
t("drift: parseMermaid round-trips entities", () => {
  const mmd = erd.schemaToMermaid(SQL, "sql");
  const back = drift.parseMermaid(mmd);
  assert.deepEqual(Object.keys(back.tables).sort(), ["authors", "posts"]);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
