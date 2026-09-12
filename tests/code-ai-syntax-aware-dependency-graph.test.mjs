import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCodeAISourceDependencies } from "../lib/code/runtime/CodeAISyntaxAwareDependencyRuntime.js";
import {
  deriveCodeAICausalGraph,
  prepareCodeAIWorldClassMission,
} from "../lib/code/runtime/CodeAIWorldClassIntelligenceRuntime.js";

test("syntax-aware parser ignores fake import calls inside comments and strings", () => {
  const analysis = analyzeCodeAISourceDependencies("lib/consumer.ts", [
    'import { run as execute } from "./runtime";',
    '// execute();',
    'const example = "execute()";',
    'execute();',
  ].join("\n"));
  assert.equal(analysis.parser, "BABEL_AST");
  assert.equal(analysis.parsed, true);
  assert.equal(analysis.calls.length, 1);
  assert.equal(analysis.calls[0].local, "execute");
  assert.equal(analysis.calls[0].imported, "run");
});

test("causal graph uses AST aliases and marks the evidence source", () => {
  const graph = deriveCodeAICausalGraph({
    files_changed: ["lib/runtime.ts"],
    source_changes: [{
      path: "lib/runtime.ts",
      operation: "write",
      content: "export function run(): boolean { return true; }",
    }],
    evidence: [{
      action: "read",
      result: {
        file_path: "lib/consumer.ts",
        content: 'import { run as execute } from "./runtime";\nexecute();',
      },
    }],
  });
  assert.equal(graph.syntax_aware_dependency_parser, true);
  assert.ok(graph.ast_parse_success_count >= 2);
  assert.ok(graph.ast_static_import_edges_observed >= 1);
  assert.ok(graph.ast_imported_symbol_call_edges_observed >= 1);
  assert.ok(graph.edges.some((edge) =>
    edge.relation === "calls_imported_symbol" &&
    edge.local_binding === "execute" &&
    edge.target_symbol === "run" &&
    edge.syntax_evidence === "AST"
  ));
  assert.equal(graph.authoritative_call_graph, false);
});

test("Supabase table and RPC references become explicit schema graph edges", () => {
  const graph = deriveCodeAICausalGraph({
    files_changed: ["lib/invoice.ts"],
    source_changes: [{
      path: "lib/invoice.ts",
      operation: "write",
      content: [
        'export async function load(db) {',
        '  await db.from("customer_invoices").select("*");',
        '  await db.rpc("post_customer_invoice", { invoice_id: "x" });',
        '}',
      ].join("\n"),
    }],
  });
  assert.equal(graph.structured_schema_dependency_analysis, true);
  assert.ok(graph.edges.some((edge) =>
    edge.relation === "references_database_table" && edge.schema_name === "public.customer_invoices"
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.relation === "calls_database_rpc" && edge.schema_name === "public.post_customer_invoice"
  ));
});

test("SQL migrations expose table, foreign-key, function and view relationships", () => {
  const graph = deriveCodeAICausalGraph({
    files_changed: ["supabase/migrations/20990101000000_invoice.sql"],
    source_changes: [{
      path: "supabase/migrations/20990101000000_invoice.sql",
      operation: "write",
      content: [
        "create table if not exists finance.invoice_lines (",
        "  invoice_id uuid references finance.customer_invoices(id)",
        ");",
        "alter table finance.invoice_lines add column amount numeric;",
        "create or replace function finance.post_invoice() returns void language sql as $$ select 1 $$;",
        "create view finance.invoice_summary as select * from finance.invoice_lines;",
      ].join("\n"),
    }],
  });
  assert.equal(graph.sql_documents_observed, 1);
  assert.ok(graph.schema_dependency_edges_observed >= 5);
  for (const relation of ["defines_table", "references_table", "alters_table", "defines_function", "defines_view"]) {
    assert.ok(graph.edges.some((edge) => edge.relation === relation), relation);
  }
  assert.equal(graph.authoritative_schema_graph, false);
  assert.equal(graph.incomplete_evidence_must_not_be_treated_as_no_dependency, true);
});

test("world-class objective reports AST and schema evidence before implementation", () => {
  const prepared = prepareCodeAIWorldClassMission({
    objective: "Change invoice persistence safely.",
    resume_state: {
      files_changed: ["lib/invoice.ts"],
      source_changes: [{
        path: "lib/invoice.ts",
        operation: "write",
        content: 'export async function save(db) { return db.from("customer_invoices").insert({}); }',
      }],
    },
  });
  assert.match(prepared.options.objective, /CAUSAL GRAPH:/);
  assert.match(prepared.options.objective, /schema edges/);
  assert.match(prepared.options.objective, /AST parsed=/);
  assert.equal(prepared.control.causal_graph.authoritative_dependency_parser, false);
});

test("changed migrations produce observed application schema compatibility obligations", () => {
  const state = {
    files_changed: ["supabase/migrations/20990101000001_invoice.sql"],
    source_changes: [{
      path: "supabase/migrations/20990101000001_invoice.sql",
      operation: "write",
      content: "alter table finance.customer_invoices add column paid_at timestamptz;",
    }],
    evidence: [{
      action: "read",
      result: {
        file_path: "lib/finance/invoices.ts",
        content: 'export async function load(db) { return db.from("finance.customer_invoices").select("*"); }',
      },
    }],
  };
  const graph = deriveCodeAICausalGraph(state);
  const impact = graph.changed_schema_impacts.find((entry) =>
    entry.schema_name === "finance.customer_invoices"
  );
  assert.ok(impact);
  assert.ok(impact.observed_consumers.some((consumer) => consumer.path === "lib/finance/invoices.ts"));

  const prepared = prepareCodeAIWorldClassMission({
    objective: "Safely change invoice persistence.",
    resume_state: state,
  });
  assert.match(prepared.options.objective, /OBSERVED SCHEMA COMPATIBILITY OBLIGATIONS/);
  assert.match(prepared.options.objective, /lib\/finance\/invoices\.ts/);
  assert.match(prepared.options.objective, /finance\.customer_invoices/);
});

test("syntax-aware parser captures imported call arity and consumed result fields", () => {
  const analysis = analyzeCodeAISourceDependencies("lib/consumer.ts", [
    'import { settleOrder } from "./runtime";',
    'const result = settleOrder(order, context);',
    'return result.invoice_id;',
  ].join("\n"));
  assert.equal(analysis.calls[0].argument_count, 2);
  assert.ok(analysis.result_field_reads.some((item) => item.imported === "settleOrder" && item.field === "invoice_id"));
});

test("syntax-aware parser captures exported function context and static return fields", () => {
  const analysis = analyzeCodeAISourceDependencies("lib/runtime.ts", 'export function settleOrder(context){ if (!context.organization_id) throw new Error("missing"); return { invoice_id: "x", ok: true }; }');
  const contract = analysis.function_contracts.find((item) => item.name === "settleOrder");
  assert.ok(contract);
  assert.equal(contract.min_arity, 1);
  assert.ok(contract.context_keys.includes("organization_id"));
  assert.ok(contract.return_fields.includes("invoice_id"));
});


test("syntax-aware parser captures explicit Supabase selected columns", () => {
  const analysis = analyzeCodeAISourceDependencies("lib/repository.ts", 'export async function load(db){ return db.from("orders").select("id,organization_id,total"); }');
  const ref = analysis.schema_references.find((item) => item.kind === "table" && item.name === "orders");
  assert.ok(ref);
  assert.deepEqual(ref.selected_columns, ["id", "organization_id", "total"]);
});

test("syntax-aware parser captures Next route response fields and TypeScript optional arity", () => {
  const analysis = analyzeCodeAISourceDependencies("app/api/orders/route.ts", [
    "export async function GET(request: Request, context?: unknown) {",
    "  return Response.json({ ok: true, invoice_id: 'x' });",
    "}",
  ].join("\n"));
  const contract = analysis.function_contracts.find((item) => item.name === "GET");
  assert.ok(contract);
  assert.equal(contract.min_arity, 1);
  assert.equal(contract.max_arity, 2);
  assert.deepEqual(contract.response_fields, ["ok", "invoice_id"]);
});

test("syntax-aware parser captures literal Supabase filters mutation fields and RPC argument keys", () => {
  const analysis = analyzeCodeAISourceDependencies("lib/repository.ts", [
    "export async function save(db, organization_id) {",
    "  await db.from('orders').update({ total: 10, organization_id }).eq('organization_id', organization_id);",
    "  await db.from('orders').upsert({ id: 'x', organization_id });",
    "  return db.rpc('post_order', { order_id: 'x', organization_id });",
    "}",
  ].join("\n"));
  const table = analysis.schema_references.find((item) => item.kind === "table" && item.name === "orders");
  const rpc = analysis.schema_references.find((item) => item.kind === "rpc" && item.name === "post_order");
  assert.ok(table);
  assert.ok(table.filter_keys.includes("organization_id"));
  assert.ok(table.mutation_fields.includes("total"));
  assert.ok(table.mutation_fields.includes("organization_id"));
  assert.ok(table.mutation_fields.includes("id"));
  assert.ok(rpc);
  assert.deepEqual(rpc.argument_keys, ["order_id", "organization_id"]);
});

test("dynamic Supabase payloads do not invent static mutation contracts", () => {
  const analysis = analyzeCodeAISourceDependencies("lib/repository.ts", [
    "export async function save(db, payload) {",
    "  return db.from('orders').update({ ...payload });",
    "}",
  ].join("\n"));
  const table = analysis.schema_references.find((item) => item.kind === "table" && item.name === "orders");
  assert.ok(table);
  assert.deepEqual(table.mutation_fields || [], []);
});
