import test from "node:test";
import assert from "node:assert/strict";
import { resolveBusinessTargetMetric as resolve } from "../lib/intelligence/runtime/AvantiqoBusinessTargetMetricResolverRuntime.js";

const cash=(currency,b,a)=>({status:"OBSERVATIONS_READY",normalized:{observations:[{measure_id:"cash_position",dimension_key:currency,baseline_value:b,actual_value:a,source_capability_key:"finance.cash_management.read"}]}});

test("single currency cash can become exact target metric",()=>{const r=resolve({metric:"cash",comparison_results:[cash("THB",1000,800)]});assert.equal(r.status,"TARGET_METRIC_READY");assert.equal(r.delta,-200);});
test("multi currency cash is not silently combined",()=>{const r=resolve({metric:"cash",comparison_results:[cash("THB",1000,800),cash("USD",10,9)]});assert.equal(r.status,"TARGET_METRIC_EVIDENCE_GAP");assert.equal(r.reason,"TARGET_METRIC_DIMENSION_AMBIGUOUS");});
test("explicit cash dimension resolves ambiguity",()=>{const r=resolve({metric:"cash",dimension_key:"THB",comparison_results:[cash("THB",1000,800),cash("USD",10,9)]});assert.equal(r.status,"TARGET_METRIC_READY");assert.equal(r.dimension_key,"THB");});
test("profit is never inferred from invoice or cash proxies",()=>{const r=resolve({metric:"profit",comparison_results:[cash("THB",1000,800)]});assert.equal(r.status,"TARGET_METRIC_EVIDENCE_GAP");assert.equal(r.reason,"NO_EXACT_TARGET_MEASURE_MODEL");});
