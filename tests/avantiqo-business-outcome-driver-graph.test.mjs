import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDriverDiagnosisPlan } from '../lib/intelligence/runtime/AvantiqoBusinessDriverGraphRuntime.js';
import { buildBusinessDriverEvidencePlan } from '../lib/intelligence/runtime/AvantiqoBusinessDriverEvidencePlanRuntime.js';
import { routeAvantiqoCognition } from '../lib/intelligence/runtime/AvantiqoCognitionRouterRuntime.js';

for (const metric of ['cash','demand','staffing','inventory_health','customer_retention','customer_acquisition','service_quality','project_delivery']) {
  test(`${metric} has a real diagnostic root`, () => {
    const plan=businessDriverDiagnosisPlan({metric,industry:'restaurant'});
    assert.equal(plan.metric,metric);
    assert.ok(plan.internal_driver_ids.length>=2);
    assert.equal(plan.authority_effect,'NONE');
  });
}

test('cash diagnosis maps to authoritative finance reads',()=>{
  const plan=buildBusinessDriverEvidencePlan({metric:'cash',available_reads:[{key:'finance.cash_management.read'},{key:'finance.customer_invoices.read'},{key:'finance.trial_balance.read'}]});
  assert.equal(plan.metric,'cash');
  assert.ok(plan.internal_evidence_plan.find(x=>x.driver_id==='cash')?.registered_read_capability_keys.includes('finance.cash_management.read'));
});

test('staffing and inventory diagnoses map to operational reads',()=>{
  const reads=[{key:'people.attendance.read'},{key:'people.employees.read'},{key:'operations.command_center.read'},{key:'supply_chain.stock_position.read'},{key:'supply_chain.inventory_items.read'}];
  assert.ok(buildBusinessDriverEvidencePlan({metric:'staffing',available_reads:reads}).registered_internal_driver_coverage>0);
  assert.ok(buildBusinessDriverEvidencePlan({metric:'inventory_health',available_reads:reads}).registered_internal_driver_coverage>0);
});

test('router recognizes non-profit business diagnosis',()=>{
  const routed=routeAvantiqoCognition({goal:'Why is our staff turnover higher and service quality worse this month?'});
  assert.equal(routed.requirements.business_driver_diagnosis_required,true);
  assert.equal(routed.mode,'deep');
});
