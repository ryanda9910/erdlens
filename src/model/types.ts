// Shared domain types for erdlens.

export type SchemaSource = "auto" | "sql" | "prisma" | "drizzle" | "typeorm" | "sqlalchemy";
export type FlowSource = "auto" | "dsl" | "json";
export type RelKind = "1-1" | "1-N" | "N-N";

export interface Column {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  nullable: boolean;
  unique: boolean;
}

export interface Relation {
  from: string;
  to: string;
  kind: RelKind;
}

export interface Schema {
  tables: Record<string, { columns: Column[] }>;
  rels: Relation[];
}

export type NodeShape = "start" | "end" | "decision" | "step";

export interface FlowNode {
  id: string;
  shape: NodeShape;
  label: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
}

export interface Graph {
  nodes: Map<string, FlowNode>;
  edges: FlowEdge[];
}

// ── drift ──
export interface ColumnChange {
  table: string;
  added: string[];
  removed: string[];
  changed: { column: string; was: string; now: string }[];
}

export interface DriftResult {
  stale: boolean;
  addedTables: string[];
  removedTables: string[];
  columnChanges: ColumnChange[];
  addedRels: string[];
  removedRels: string[];
}
