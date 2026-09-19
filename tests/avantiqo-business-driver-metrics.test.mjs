import test from "node:test";
import assert from "node:assert/strict";
import { businessDriverDiagnosisPlan } from "../lib/intelligence/runtime/AvantiqoBusinessDriverGraphRuntime.js";
import { buildBusinessDriverEvidencePlan } from "../lib/intelligence/runtime/AvantiqoBusinessDriverEvidencePlanRuntime.js";

const reads=[
 {key:"finance.cash_management.read"},{key:"finance.customer_invoices.read"},{key:"finance.trial_balance.read"},
 {key:"people.attendance.read"},{key:"people.employees.read"},{key:"operations.command_center.read"},
 {key:"supply_chain.stock_position.read"},{key:"supply_chain.inventory_items.read"},
 {key:"commercial.customers.read"},{key:"commercial.quotations.read"},{key:"solutions.hotel_bookings.read"}
];

test("cash diagnosis uses collection and payable drivers",()=>{
 const x=businessDriverDiagnosisPlan({metric:"cash"});
 assert.equal(x.metric,"cash");
 assert.ok(x.internal_driver_ids.includes("receivables_collection"));
 assert.ok(x.internal_driver_ids.includes("payables_timing"));
});

test("staffing diagnosis has registered people evidence",()=>{
 const x=buildBusinessDriverEvidencePlan({metric:"staffing",available_reads:reads});
 const coverage=new Map(x.internal_evidence_plan.map(r=>[r.driver_id,r]));
 assert.equal(coverage.get("staff_coverage").coverage_status,"REGISTERED_READ_AVAILABLE");
 assert.equal(coverage.get("attendance_reliability").coverage_status,"REGISTERED_READ_AVAILABLE");
});

test("inventory health uses stock evidence",()=>{
 const x=buildBusinessDriverEvidencePlan({metric:"inventory_health",available_reads:reads});
 assert.ok(x.internal_evidence_plan.find(r=>r.driver_id==="inventory_availability").registered_read_capability_keys.includes("supply_chain.stock_position.read"));
});

test("customer retention and acquisition remain read only evidence plans",()=>{
 for (const metric of ["customer_retention","customer_acquisition"]) {
  const x=buildBusinessDriverEvidencePlan({metric,available_reads:reads});
  assert.equal(x.authority_effect,"NONE");
  assert.ok(x.internal_evidence_plan.some(r=>r.registered_read_capability_keys.includes("commercial.customers.read")));
 }
});

test("project delivery exposes supplier disruption as external hypothesis",()=>{
 const x=buildBusinessDriverEvidencePlan({metric:"project_delivery",available_reads:reads});
 assert.ok(x.external_evidence_plan.some(r=>r.context_id==="supplier_disruption"));
 assert.equal(x.execution_policy.external_evidence_is_not_internal_product_truth,true);
});
