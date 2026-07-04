import assert from "node:assert";
import * as flow from "../dist/model/flow.js";

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("  ok  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + "\n      " + e.message); }
}

t("detects DSL vs JSON", () => {
  assert.equal(flow.detectFlow("a -> b"), "dsl");
  assert.equal(flow.detectFlow('[{"id":"a"}]'), "json");
});

// ── DSL ──
const DSL = `
start -> validate
validate -> charge : ok
validate -> reject : fail
charge -> notify -> done
`;
t("DSL: sequential edge", () => {
  const g = flow.parse(DSL, "dsl");
  assert.ok(g.edges.find((e) => e.from === "start" && e.to === "validate"));
});
t("DSL: labelled branch keeps the condition", () => {
  const g = flow.parse(DSL, "dsl");
  const ok = g.edges.find((e) => e.from === "validate" && e.to === "charge");
  assert.equal(ok.label, "ok");
});
t("DSL: chain a -> b -> c expands", () => {
  const g = flow.parse(DSL, "dsl");
  assert.ok(g.edges.find((e) => e.from === "charge" && e.to === "notify"));
  assert.ok(g.edges.find((e) => e.from === "notify" && e.to === "done"));
});
t("DSL: start/end are stadium nodes", () => {
  const g = flow.parse(DSL, "dsl");
  assert.equal(g.nodes.get("start").shape, "start");
  assert.equal(g.nodes.get("done").shape, "end");
});
t("DSL: node with ? is a decision", () => {
  const g = flow.parse("check? -> a : yes\ncheck? -> b : no", "dsl");
  assert.equal(g.nodes.get("check").shape, "decision");
});
t("DSL: mermaid output is a flowchart with labelled edge", () => {
  const m = flow.flowToMermaid(DSL, "dsl");
  assert.ok(m.startsWith("flowchart TD"));
  assert.ok(/validate -->\|ok\| charge/.test(m));
  assert.ok(/start\(\["start"\]\)/.test(m));
});
t("DSL: # comments ignored", () => {
  const g = flow.parse("a -> b  # go\n# whole line\n", "dsl");
  assert.equal(g.edges.length, 1);
});

// ── JSON ──
const JSON_WF = JSON.stringify([
  { id: "validate", decision: true, next: [{ to: "charge", when: "ok" }, { to: "reject", when: "fail" }] },
  { id: "charge", next: "notify" },
  { id: "notify", next: "done" },
]);
t("JSON: branches with when labels", () => {
  const g = flow.parse(JSON_WF, "json");
  const ok = g.edges.find((e) => e.from === "validate" && e.to === "charge");
  assert.equal(ok.label, "ok");
});
t("JSON: string next is a plain edge", () => {
  const g = flow.parse(JSON_WF, "json");
  assert.ok(g.edges.find((e) => e.from === "charge" && e.to === "notify"));
});
t("JSON: decision flag -> diamond", () => {
  const g = flow.parse(JSON_WF, "json");
  assert.equal(g.nodes.get("validate").shape, "decision");
});
t("JSON: renders a valid flowchart", () => {
  const m = flow.flowToMermaid(JSON_WF, "json");
  assert.ok(m.startsWith("flowchart TD"));
  assert.ok(/validate\{"validate"\}/.test(m));
});

// ── direction option ──
t("direction option LR", () => {
  assert.ok(flow.flowToMermaid("a -> b", "dsl", { direction: "LR" }).startsWith("flowchart LR"));
});

// ── round-trip for drift ──
t("parseMermaid round-trips edges", () => {
  const m = flow.flowToMermaid(DSL, "dsl");
  const g = flow.parseMermaid(m);
  assert.ok(g.edges.find((e) => e.from === "validate" && e.to === "charge"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
