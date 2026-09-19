import test from "node:test";
import assert from "node:assert/strict";
import { selectBusinessFactorDecomposition } from "../lib/intelligence/runtime/AvantiqoBusinessFactorDecompositionSelectorRuntime.js";

const scope={organization_id:"org",entity_id:"ent",baseline_period_id:"p1",current_period_id:"p2"};
const volume={factor_id:"volume",baseline_value:10,actual_value:12,unit:"quantity",basis_key:"covers",scope,evidence_status:"EXACT_FACTOR_OBSERVATION",source_capability_key:"sales.exact"};
const price={factor_id:"price",baseline_value:100,actual_value:110,unit:"currency_per_quantity",basis_key:"covers",currency_code:"THB",scope,evidence_status:"EXACT_FACTOR_OBSERVATION",source_capability_key:"sales.exact"};

test("selector activates exact revenue Shapley only when product reconciles target",()=>{const r=selectBusinessFactorDecomposition({metric:"revenue",factor_observations:[volume,price],target_metric:{status:"TARGET_METRIC_READY",baseline_value:1000,actual_value:1320}});assert.equal(r.status,"DECOMPOSITION_READY");assert.equal(r.model,"REVENUE_TWO_FACTOR_SHAPLEY");assert.equal(r.explained_amount,320);});
test("selector rejects factor product that does not reconcile observed revenue",()=>{const r=selectBusinessFactorDecomposition({metric:"revenue",factor_observations:[volume,price],target_metric:{status:"TARGET_METRIC_READY",baseline_value:1000,actual_value:1400}});assert.equal(r.status,"DECOMPOSITION_NOT_AVAILABLE");assert.equal(r.reason,"FACTOR_PRODUCT_DOES_NOT_RECONCILE_TARGET");});
test("selector rejects mismatched basis",()=>{const r=selectBusinessFactorDecomposition({metric:"revenue",factor_observations:[volume,{...price,basis_key:"room_nights"}],target_metric:{status:"TARGET_METRIC_READY",baseline_value:1000,actual_value:1320}});assert.equal(r.reason,"FACTOR_BASIS_MISMATCH");});
test("selector rejects mismatched scope",()=>{const r=selectBusinessFactorDecomposition({metric:"revenue",factor_observations:[volume,{...price,scope:{...scope,current_period_id:"p3"}}],target_metric:{status:"TARGET_METRIC_READY",baseline_value:1000,actual_value:1320}});assert.equal(r.reason,"FACTOR_SCOPE_MISMATCH");});
