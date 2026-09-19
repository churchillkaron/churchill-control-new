import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessEvidenceExecutionPlan } from "../lib/intelligence/runtime/AvantiqoBusinessEvidenceExecutionPlanRuntime.js";

test("cash plan deduplicates internal authoritative reads",()=>{
  const p=buildBusinessEvidenceExecutionPlan({metric:"cash"});
  const keys=p.internal_reads.map(x=>x.capability_key);
  assert.equal(keys.length,new Set(keys).size);
  assert.ok(keys.includes("finance.cash_management.read"));
  assert.ok(keys.includes("finance.customer_invoices.read"));
  assert.equal(p.policy.internal_reads_before_external_research,true);
});

test("staffing plan prioritizes people evidence and remains read only",()=>{
  const p=buildBusinessEvidenceExecutionPlan({metric:"staffing"});
  const keys=p.internal_reads.map(x=>x.capability_key);
  assert.ok(keys.includes("people.attendance.read"));
  assert.ok(keys.includes("people.employees.read"));
  assert.ok(p.internal_reads.every(x=>x.mutates===false));
  assert.equal(p.authority_effect,"NONE");
});

test("external research is residual gated",()=>{
  const p=buildBusinessEvidenceExecutionPlan({metric:"demand"});
  assert.ok(p.external_queries.length>0);
  assert.ok(p.external_queries.every(x=>x.execute_only_if_internal_residual_remains===true));
  assert.ok(p.execution_order.includes("CALCULATE_UNEXPLAINED_RESIDUAL"));
});
