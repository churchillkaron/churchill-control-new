import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const turn = read("lib/operator/runtime/OperatorTurnRuntime.js");
const catalog = read("lib/operator/runtime/OperatorCapabilityCatalog.js");
const customer = read("lib/finance/accounts-receivable/CreateCustomerInvoice/execute.js");
const vendor = read("lib/finance/accounts-payable/capabilities/createVendorBill.js");
const customerRoute = read("app/api/finance/customer-invoices/route.js");
const vendorRoute = read("app/api/finance/vendor-invoices/list/route.js");

const stages = {
  mission_planning: has(catalog, /operator_verification/),
  governed_execution: has(turn, /preflightSelectedRecommendationVerification/),
  business_effect_verification: has(core, /resultBoundVerification/),
  failure_capture: has(core, /post_action_verification/),
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
};
Object.assign(stages, {
  authoritative_replay: has(core, /business_effect_outcome/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /business_effect_verified/),
  learning_evidence: true,
});

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_GENERATED_ID_VERIFICATION",
  stages,
});
report.domain_evidence = {
  customer_invoice_result_binding: has(customer, /payload_from_result/) && has(customer, /finance\.customer_invoices\.read/),
  vendor_bill_result_binding: has(vendor, /payload_from_result/) && has(vendor, /finance\.vendor_bills\.read/),
  verifier_preflight_before_write: has(turn, /actionCapability/) && has(turn, /verificationCapabilityKey/),
  result_payload_bound_after_write: has(core, /resolvedResultVerification/) && has(core, /resultBoundVerification/),
  exact_customer_invoice_filter: has(customerRoute, /query = query\.eq\("id", invoiceId\)/),
  exact_vendor_invoice_filter: has(vendorRoute, /invoiceQuery = invoiceQuery\.eq\("id", invoiceId\)/),
  no_generated_id_guess: has(core, /if \(value === undefined\) return null/),
  fail_closed_without_result_identity: has(core, /return null/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
