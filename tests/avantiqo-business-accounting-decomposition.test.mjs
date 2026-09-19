import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountingDecomposition } from "../lib/intelligence/runtime/AvantiqoBusinessAccountingDecompositionRuntime.js";

const row=(measure_id,baseline_value,actual_value)=>({measure_id,baseline_value,actual_value,source_capability_key:"finance.profit_loss.read"});
const comparison=(rows)=>[{normalized:{observations:rows}}];

test("profit decomposes as revenue minus total cost",()=>{
  const r=buildAccountingDecomposition({metric:"profit",comparison_results:comparison([row("recognized_revenue",1000,1200),row("total_cost",700,800),row("net_profit",300,400),row("cogs_amount",300,360)])});
  assert.equal(r.status,"DECOMPOSITION_READY");
  assert.equal(r.model,"PROFIT_EQUALS_REVENUE_MINUS_TOTAL_COST");
  assert.deepEqual(r.driver_rows.map(x=>[x.driver_id,x.direct_contribution]),[["revenue",200],["cost_total",-100]]);
});

test("nested cogs is not added to profit decomposition",()=>{
  const r=buildAccountingDecomposition({metric:"profit",comparison_results:comparison([row("recognized_revenue",1000,1200),row("total_cost",700,800),row("cogs_amount",300,360)])});
  assert.equal(r.driver_rows.some(x=>x.driver_id==="cogs"),false);
});

test("total cost decomposes into cogs plus operating expenses",()=>{
  const r=buildAccountingDecomposition({metric:"cost_total",comparison_results:comparison([row("cogs_amount",300,360),row("operating_expenses",400,440),row("total_cost",700,800)])});
  assert.deepEqual(r.driver_rows.map(x=>[x.driver_id,x.direct_contribution]),[["cogs",60],["operating_expenses",40]]);
});

test("missing identity inputs leaves decomposition unavailable",()=>{
  const r=buildAccountingDecomposition({metric:"profit",comparison_results:comparison([row("recognized_revenue",1000,1200)])});
  assert.equal(r.status,"DECOMPOSITION_NOT_AVAILABLE");
  assert.deepEqual(r.driver_rows,[]);
});
