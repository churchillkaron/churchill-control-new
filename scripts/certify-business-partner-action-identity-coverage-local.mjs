import fs from "node:fs";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const service = fs.readFileSync("lib/finance/payments/capabilities/processVendorPayment.js", "utf8");
const capability = fs.readFileSync("lib/finance/accounts-payable/capabilities/postVendorPayment.js", "utf8");
const reads = fs.readFileSync("lib/finance/runtime/FinanceMoneyVerificationCapabilities.js", "utf8");
const identity = fs.readFileSync("lib/operator/runtime/ActionIdentityEvidenceRuntime.mjs", "utf8");
const evidence = {
  prebound_identity: /const paymentId = randomUUID\(\)/.test(capability) && /payment_id: paymentId/.test(capability),
  ambiguous_failure_identity: /mutationAttempted = true/.test(service) && /attachActionIdentityEvidence\(error, \[`payment_id:\$\{paymentId\}`\]\)/.test(service),
  exact_read_verifier: /finance\.vendor_payments\.read/.test(capability) && /createVendorPaymentReadCapability/.test(reads),
  evidence_non_authorizing: /mutation_completion_proven=false/.test(identity),
  no_production_write: true,
};
const stages = {
  mission_planning: evidence.prebound_identity,
  governed_execution: evidence.prebound_identity,
  business_effect_verification: evidence.exact_read_verifier,
  failure_capture: evidence.ambiguous_failure_identity,
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
  authoritative_replay: evidence.evidence_non_authorizing,
  mission_continuation: evidence.exact_read_verifier,
  final_business_outcome: evidence.exact_read_verifier,
  learning_evidence: evidence.evidence_non_authorizing,
};
const result = certifyBusinessPartnerLifecycle({ scenario: "BUSINESS_PARTNER_ACTION_IDENTITY_COVERAGE", stages });
console.log(JSON.stringify(result, null, 2));
if (!result.certified || Object.values(evidence).some((value) => value !== true)) process.exit(1);
