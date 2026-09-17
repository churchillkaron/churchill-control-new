import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessDiagnosisPipeline, completeBusinessDiagnosisPipeline } from "../lib/intelligence/runtime/AvantiqoBusinessDiagnosisPipelineRuntime.js";

test("pipeline composes diagnosis evidence and read execution",()=>{const p=buildBusinessDiagnosisPipeline({metric:"cash"});assert.equal(p.metric,"cash");assert.ok(p.execution_plan.internal_reads.length>0);assert.equal(p.external_research_allowed,false);assert.equal(p.authority_effect,"NONE");});

test("small residual does not open external research",()=>{const p=buildBusinessDiagnosisPipeline({metric:"profit"});const r=completeBusinessDiagnosisPipeline({plan:p,baseline_value:100,actual_value:90,driver_rows:[{driver_id:"revenue",direct_contribution:-9.7}]});assert.equal(r.residual_material,false);assert.equal(r.external_research_allowed,false);assert.equal(r.final_evidence_state,"INTERNAL_SUFFICIENT");});

test("material residual opens causal stage without inventing support",()=>{const p=buildBusinessDiagnosisPipeline({metric:"profit"});const r=completeBusinessDiagnosisPipeline({plan:p,baseline_value:100,actual_value:80,driver_rows:[{driver_id:"revenue",direct_contribution:-8}],external_evidence:[{context_id:"weather",evidence_strength:.8,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:false,alternative_explanations_checked:false}]});assert.equal(r.residual_material,true);assert.equal(r.external_research_allowed,true);assert.deepEqual(r.causal.supported_context_ids,[]);assert.equal(r.final_evidence_state,"INTERNAL_WITH_UNRESOLVED_EXTERNAL_RESIDUAL");});

test("fully supported external evidence is clearly separated from internal proof",()=>{const p=buildBusinessDiagnosisPipeline({metric:"demand"});const r=completeBusinessDiagnosisPipeline({plan:p,baseline_value:100,actual_value:70,driver_rows:[{driver_id:"volume",direct_contribution:-10}],external_evidence:[{context_id:"weather",evidence_strength:.9,timing_consistent:true,direction_consistent:true,magnitude_plausible:true,confounders_checked:true,alternative_explanations_checked:true}]});assert.deepEqual(r.causal.supported_context_ids,["weather"]);assert.equal(r.final_evidence_state,"INTERNAL_AND_SUPPORTED_EXTERNAL");assert.equal(r.authority_effect,"NONE");});

test("comparison bundle preserves ambiguous driver coverage as unresolved",()=>{
  const plan=buildBusinessDiagnosisPipeline({metric:"staffing"});
  const comparison_results=[{capability_key:"people.attendance.read",status:"OBSERVATIONS_READY",comparison_pair_fingerprint:"fp",mapped:{driver_rows:[{driver_id:"attendance_reliability",measure_id:"worked_shifts",baseline_value:8,actual_value:9},{driver_id:"attendance_reliability",measure_id:"late_shifts",baseline_value:1,actual_value:3}]}}];
  const done=completeBusinessDiagnosisPipeline({plan,baseline_value:10,actual_value:12,comparison_results});
  assert.ok(done.evidence_bundle.ambiguous_driver_ids.includes("attendance_reliability"));
  assert.equal(done.evidence_bundle.contribution_rows.length,0);
});

test("missing exact target metric blocks variance instead of guessing",()=>{
  const plan=buildBusinessDiagnosisPipeline({metric:"profit"});
  const out=completeBusinessDiagnosisPipeline({plan,comparison_results:[]});
  assert.equal(out.final_evidence_state,"TARGET_METRIC_EVIDENCE_GAP");
  assert.equal(out.variance,null);
  assert.equal(out.external_research_allowed,false);
});

test("single currency cash target can be resolved from comparison observations",()=>{
  const plan=buildBusinessDiagnosisPipeline({metric:"cash"});
  const comparison_results=[{status:"OBSERVATIONS_READY",capability_key:"finance.cash_management.read",normalized:{observations:[{measure_id:"cash_position",dimension_key:"THB",baseline_value:1000,actual_value:900,source_capability_key:"finance.cash_management.read"}]},mapped:{driver_rows:[{driver_id:"cash",measure_id:"cash_position",dimension_key:"THB",baseline_value:1000,actual_value:900,source_capability_key:"finance.cash_management.read"}]}}];
  const out=completeBusinessDiagnosisPipeline({plan,comparison_results,target_dimension_key:"THB"});
  assert.equal(out.target_metric.status,"TARGET_METRIC_READY");
  assert.equal(out.variance.metric_change,-100);
});


test("profit pipeline prefers accounting identity over nested bundle rows",()=>{
  const plan=buildBusinessDiagnosisPipeline({metric:"profit"});
  const obs=(measure_id,baseline_value,actual_value)=>({measure_id,dimension_key:"THB",baseline_value,actual_value,source_capability_key:"finance.profit_loss.read"});
  const comparison_results=[{status:"OBSERVATIONS_READY",capability_key:"finance.profit_loss.read",normalized:{observations:[obs("recognized_revenue",1000,1200),obs("cogs_amount",300,360),obs("operating_expenses",400,440),obs("total_cost",700,800),obs("net_profit",300,400)]},mapped:{driver_rows:[{driver_id:"profit",measure_id:"net_profit",baseline_value:300,actual_value:400,source_capability_key:"finance.profit_loss.read"},{driver_id:"revenue",measure_id:"recognized_revenue",baseline_value:1000,actual_value:1200,source_capability_key:"finance.profit_loss.read"},{driver_id:"cost_total",measure_id:"total_cost",baseline_value:700,actual_value:800,source_capability_key:"finance.profit_loss.read"},{driver_id:"cogs",measure_id:"cogs_amount",baseline_value:300,actual_value:360,source_capability_key:"finance.profit_loss.read"}]}}];
  const out=completeBusinessDiagnosisPipeline({plan,comparison_results,target_dimension_key:"THB"});
  assert.equal(out.accounting_decomposition.model,"PROFIT_EQUALS_REVENUE_MINUS_TOTAL_COST");
  assert.equal(out.variance.metric_change,100);
  assert.equal(out.variance.explained_amount,100);
  assert.equal(out.variance.unexplained_residual,0);
  assert.deepEqual(out.variance.contributions.map(x=>[x.driver_id,x.contribution_amount]),[["revenue",200],["cost_total",-100]]);
});


test("small residual with incomplete driver coverage is not labeled sufficient",()=>{
  const plan=buildBusinessDiagnosisPipeline({metric:"staffing"});
  const comparison_results=[{status:"OBSERVATIONS_READY",capability_key:"people.attendance.read",mapped:{driver_rows:[{driver_id:"attendance_reliability",measure_id:"late_shifts",baseline_value:1,actual_value:1}]}}];
  const out=completeBusinessDiagnosisPipeline({plan,baseline_value:10,actual_value:10,comparison_results});
  assert.equal(out.residual_material,false);
  assert.equal(out.numeric_reconciliation_complete,true);
  assert.equal(out.internal_coverage_incomplete,true);
  assert.equal(out.final_evidence_state,"INTERNAL_COVERAGE_INCOMPLETE");
});

test("profit identity can reconcile while deeper driver coverage remains incomplete",()=>{
  const plan=buildBusinessDiagnosisPipeline({metric:"profit"});
  const obs=(measure_id,baseline_value,actual_value)=>({measure_id,dimension_key:"THB",baseline_value,actual_value,source_capability_key:"finance.profit_loss.read"});
  const comparison_results=[{status:"OBSERVATIONS_READY",capability_key:"finance.profit_loss.read",normalized:{observations:[obs("recognized_revenue",1000,1200),obs("cogs_amount",300,360),obs("operating_expenses",400,440),obs("total_cost",700,800),obs("net_profit",300,400)]},mapped:{driver_rows:[{driver_id:"profit",measure_id:"net_profit",baseline_value:300,actual_value:400,source_capability_key:"finance.profit_loss.read"},{driver_id:"revenue",measure_id:"recognized_revenue",baseline_value:1000,actual_value:1200,source_capability_key:"finance.profit_loss.read"},{driver_id:"cost_total",measure_id:"total_cost",baseline_value:700,actual_value:800,source_capability_key:"finance.profit_loss.read"},{driver_id:"cogs",measure_id:"cogs_amount",baseline_value:300,actual_value:360,source_capability_key:"finance.profit_loss.read"}]}}];
  const out=completeBusinessDiagnosisPipeline({plan,comparison_results,target_dimension_key:"THB"});
  assert.equal(out.variance.unexplained_residual,0);
  assert.equal(out.numeric_reconciliation_complete,true);
  assert.equal(out.internal_coverage_incomplete,true);
  assert.equal(out.final_evidence_state,"INTERNAL_COVERAGE_INCOMPLETE");
});
