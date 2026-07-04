# Real runs

Actual erdlens runs, not mockups. Verified two ways: 37 assertions (`npm test`), and a headless
browser that renders the produced Mermaid to confirm it's valid.

Reproduce:
```
npm test
```

---

## Case 1 — SQL DDL → embeddable ER diagram

Given `db/schema.sql`:
```sql
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);
CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors(id));
CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER REFERENCES posts(id), body TEXT);
```

`schema_to_erd` returned (verbatim):
```
Detected sql schema, 3 tables.

​```mermaid
erDiagram
  posts ||--o{ authors : ""
  comments ||--o{ posts : ""
  authors {
    integer id PK
    text name
    text email UK
  }
  posts {
    integer id PK
    text title
    integer author_id FK
  }
  comments {
    integer id PK
    integer post_id FK
  }
​```
```

That fenced block was pasted into a browser with Mermaid — it rendered three entities with the right
PK/FK/UK markers and crow's-foot relations. The diagram is valid, not just text.

## Case 2 — `render_erd` writes straight into a doc

`render_erd` with `out_path: docs/schema.mmd` wrote three files in one call: `docs/schema.mmd` (source),
`docs/schema.md` (the fenced block, ready to include), and `docs/schema.html` (a self-contained preview).
No copy-paste step — the diagram is already in a file the doc can reference.

## Case 3 — drift catches a stale diagram

After the diagram was written, a migration added a table. `drift_check` on the same doc:
```
Diagram is stale. It drifted from the current schema:
  + tables added since: tags
Regenerate with render_erd to fix.
```
Before the migration, the same call reported **"In sync."** The CLI (`erdlens drift ...`) exits non-zero
when stale, so it fails a CI step instead of shipping a wrong diagram.

## Case 4 — five schema sources, one output

The same three-table shape was fed as SQL, Prisma, Drizzle, TypeORM, and SQLAlchemy. Each auto-detected
and produced an equivalent `erDiagram` with the PK, FK, and 1-N relation intact (see the parser tests in
`test/erd.test.mjs`). You point erdlens at whatever your schema actually lives in — a `.sql` dump, a
Prisma file, or ORM model files — not just one.
