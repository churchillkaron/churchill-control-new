import test from "node:test";
import assert from "node:assert/strict";
import { listOperatorFastReads } from "../lib/operator/runtime/OperatorFastReadIndex.js";
import { normalizeBusinessObservationPair } from "../lib/intelligence/runtime/AvantiqoBusinessObservationNormalizerRuntime.js";
import { mapBusinessObservationsToDriverRows } from "../lib/intelligence/runtime/AvantiqoBusinessObservationDriverMapRuntime.js";
import { resolveBusinessTargetMetric } from "../lib/intelligence/runtime/AvantiqoBusinessTargetMetricResolverRuntime.js";

const scope={organization_id:"org",entity_id:"ent",baseline_period_id:"p1",current_period_id:"p2"};
const pnl=(revenue,cogs,expenses,netProfit)=>({success:true,document:{currency:{code:"THB"},summary:{revenue,cogs,expenses,netProfit}}});

test("profit loss is a registered deterministic entity read",()=>{
  const read=listOperatorFastReads().find(r=>r.key==="finance.profit_loss.read");
  assert.equal(read?.direct_endpoint,"/api/finance/reports/profit-loss");
  assert.equal(read?.context_scope,"entity");
  assert.equal(read?.mode,"read");
});

test("profit loss normalizer exposes exact accounting measures",()=>{
  const r=normalizeBusinessObservationPair({capability_key:"finance.profit_loss.read",baseline:pnl(1000,300,400,300),current:pnl(1200,360,440,400),scope});
  assert.equal(r.status,"OBSERVATIONS_READY");
  assert.equal(r.observations.find(x=>x.measure_id==="net_profit").delta,100);
  assert.equal(r.observations.find(x=>x.measure_id==="total_cost").actual_value,800);
  assert.equal(r.observations[0].dimension_key,"THB");
});

test("profit target resolves only from canonical P&L evidence",()=>{
  const normalized=normalizeBusinessObservationPair({capability_key:"finance.profit_loss.read",baseline:pnl(1000,300,400,300),current:pnl(1200,360,440,400),scope});
  const result={normalized};
  const target=resolveBusinessTargetMetric({metric:"profit",comparison_results:[result]});
  assert.equal(target.status,"TARGET_METRIC_READY");
  assert.equal(target.baseline_value,300);
  assert.equal(target.actual_value,400);
  assert.equal(target.source_capability_key,"finance.profit_loss.read");
});

test("P&L measures map to exact accounting drivers",()=>{
  const normalized=normalizeBusinessObservationPair({capability_key:"finance.profit_loss.read",baseline:pnl(1000,300,400,300),current:pnl(1200,360,440,400),scope});
  const mapped=mapBusinessObservationsToDriverRows({observations:normalized.observations,allowed_driver_ids:["profit","revenue","cost_total","cogs"]});
  const ids=new Set(mapped.driver_rows.map(r=>r.driver_id));
  assert.deepEqual(ids,new Set(["profit","revenue","cost_total","cogs"]));
});
