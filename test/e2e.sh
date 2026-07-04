#!/usr/bin/env bash
# End-to-end: drive the erdlens MCP server through a REAL Claude Code run (claude -p),
# the way a user actually would. Proves the whole loop: Claude reads a schema, calls
# our MCP tool, and writes an ER diagram into a doc — no copy-paste.
#
# Requires: claude CLI logged in (own auth, no API key needed in shell).
# Run: bash test/e2e.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

echo "workdir: $WORK"

# a real schema to document
cat > schema.sql <<'SQL'
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);
CREATE TABLE posts  (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors(id));
CREATE TABLE comments (id INTEGER PRIMARY KEY, post_id INTEGER REFERENCES posts(id), body TEXT);
SQL

# a workflow spec to diagram
cat > publish.flow <<'FLOW'
start -> draft
draft -> review
review -> publish : approved
review -> draft : changes
publish -> done
FLOW

# register erdlens as a project-scoped MCP server (local scope, this dir only)
claude mcp remove erdlens 2>/dev/null || true
claude mcp add erdlens -- node "$ROOT/dist/index.js" mcp
echo "registered erdlens MCP"

fail=0
pass() { echo "  ok  $1"; }
bad()  { echo "FAIL  $1"; fail=1; }

# ── E2E 1: schema -> ERD into a doc ──
echo "--- e2e 1: schema_to_erd / render_erd ---"
claude -p "Use the erdlens MCP tool render_erd to turn schema.sql into an ER diagram written to docs/schema.mmd. Then stop." \
  --allowedTools "mcp__erdlens__render_erd" "mcp__erdlens__schema_to_erd" "Read" "Bash(mkdir:*)" \
  >/dev/null 2>&1 || true

if [ -f docs/schema.mmd ] && grep -q "erDiagram" docs/schema.mmd; then pass "Claude wrote docs/schema.mmd via MCP"; else bad "docs/schema.mmd not written"; fi
if [ -f docs/schema.mmd ] && grep -q "posts" docs/schema.mmd; then pass "ERD contains the tables"; else bad "ERD missing tables"; fi

# ── E2E 2: workflow -> flowchart into a doc ──
echo "--- e2e 2: render_workflow ---"
claude -p "Use the erdlens MCP tool render_workflow to turn publish.flow into a Mermaid flowchart written to docs/publish.mmd. Then stop." \
  --allowedTools "mcp__erdlens__render_workflow" "mcp__erdlens__workflow_to_diagram" "Read" \
  >/dev/null 2>&1 || true

if [ -f docs/publish.mmd ] && grep -q "flowchart" docs/publish.mmd; then pass "Claude wrote docs/publish.mmd flowchart"; else bad "docs/publish.mmd not written"; fi
if [ -f docs/publish.mmd ] && grep -q "approved" docs/publish.mmd; then pass "flowchart keeps branch labels"; else bad "flowchart missing branch labels"; fi

# ── E2E 3: drift detection after a migration ──
echo "--- e2e 3: drift_check ---"
if [ -f docs/schema.mmd ]; then
  echo "CREATE TABLE tags (id INTEGER PRIMARY KEY, label TEXT);" >> schema.sql
  OUT=$(claude -p "Use the erdlens MCP tool drift_check with doc_path docs/schema.mmd and schema_path schema.sql. Report exactly what it returns, then stop." \
    --allowedTools "mcp__erdlens__drift_check" "Read" 2>/dev/null || true)
  if echo "$OUT" | grep -qi "stale\|tags\|drift"; then pass "Claude ran drift_check and saw the stale diagram"; else bad "drift not surfaced (got: $(echo "$OUT" | head -c 120))"; fi
else
  bad "skipped drift (no schema.mmd from e2e 1)"
fi

claude mcp remove erdlens 2>/dev/null || true
echo ""
[ $fail -eq 0 ] && echo "e2e PASS" || echo "e2e FAIL"
exit $fail
