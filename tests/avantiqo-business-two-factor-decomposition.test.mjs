import test from "node:test";
import assert from "node:assert/strict";
import { decomposeTwoFactorProduct } from "../lib/intelligence/runtime/AvantiqoBusinessTwoFactorDecompositionRuntime.js";

test("two factor Shapley exactly reconciles multiplicative change",()=>{
  const r=decomposeTwoFactorProduct({metric:"revenue",factor_a_id:"volume",factor_b_id:"price",baseline_a:10,actual_a:12,baseline_b:100,actual_b:110});
  assert.equal(r.status,"DECOMPOSITION_READY");
  assert.equal(r.baseline_value,1000);
  assert.equal(r.actual_value,1320);
  assert.equal(r.metric_change,320);
  assert.equal(r.explained_amount,320);
  assert.equal(r.residual,0);
  assert.deepEqual(r.driver_rows.map(x=>[x.driver_id,x.direct_contribution]),[["volume",210],["price",110]]);
});

test("two factor Shapley is order independent",()=>{
  const a=decomposeTwoFactorProduct({metric:"labor",factor_a_id:"hours",factor_b_id:"wage_rate",baseline_a:100,actual_a:120,baseline_b:200,actual_b:220});
  const b=decomposeTwoFactorProduct({metric:"labor",factor_a_id:"wage_rate",factor_b_id:"hours",baseline_a:200,actual_a:220,baseline_b:100,actual_b:120});
  const am=new Map(a.driver_rows.map(x=>[x.driver_id,x.direct_contribution]));
  const bm=new Map(b.driver_rows.map(x=>[x.driver_id,x.direct_contribution]));
  assert.equal(am.get("hours"),bm.get("hours"));
  assert.equal(am.get("wage_rate"),bm.get("wage_rate"));
});

test("missing exact factor refuses decomposition",()=>{
  const r=decomposeTwoFactorProduct({metric:"revenue",factor_a_id:"volume",factor_b_id:"price",baseline_a:10,actual_a:12,baseline_b:null,actual_b:110});
  assert.equal(r.status,"DECOMPOSITION_NOT_AVAILABLE");
  assert.equal(r.reason,"EXACT_TWO_FACTOR_INPUTS_REQUIRED");
});

test("two factor decomposition grants no authority",()=>{
  const r=decomposeTwoFactorProduct({metric:"labor",factor_a_id:"hours",factor_b_id:"wage_rate",baseline_a:1,actual_a:2,baseline_b:3,actual_b:4});
  assert.equal(r.authority_effect,"NONE");
  assert.equal(r.policy.authority_effect,"NONE");
});
