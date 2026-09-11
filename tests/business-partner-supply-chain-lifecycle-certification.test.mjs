import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

test("Supply Chain Business Partner lifecycle is structurally certified end to end",()=>{
  const run=spawnSync(process.execPath,["scripts/certify-business-partner-supply-chain-lifecycle-local.mjs"],{encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const report=JSON.parse(run.stdout);
  assert.equal(report.contract,BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT);
  assert.equal(report.scenario,"SUPPLY_CHAIN_VENDOR_INVOICE_TO_RECURSIVE_MENU_COST_WITH_SELF_HEALING");
  assert.equal(report.certified,true);
  assert.deepEqual(report.failed_stages,[]);
  assert.ok(Object.values(report.domain_evidence).every(Boolean));
  assert.equal(report.production_writes_performed,false);
});

test("Finance vendor bill cannot directly mutate operational costs",()=>{
  const ap=fs.readFileSync("lib/finance/accounts-payable/documents/createVendorInvoice.js","utf8");
  const core=fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js","utf8");
  assert.doesNotMatch(ap,/supply_chain_apply_vendor_invoice_costs_atomic/);
  assert.match(core,/agreementWithPendingConfirmationRun/);
  assert.match(core,/separate Supply Chain write and requires your confirmation/);
});
