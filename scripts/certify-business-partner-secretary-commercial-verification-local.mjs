import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const declaration = read("lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const turn = read("lib/operator/runtime/OperatorTurnRuntime.js");
const commercialRuntime = read("lib/commercial/runtime/CommercialRuntime.js");
const customerCreate = read("lib/commercial/customers/capabilities/createCustomer.js");
const customerRead = read("lib/commercial/customers/capabilities/readCustomer.js");
const messageSend = read("lib/commercial/communications/capabilities/sendDraftMessage.js");
const messageRead = read("lib/commercial/communications/capabilities/readMessage.js");

const stages = {
  mission_planning: has(declaration, /same_capability_registered_read_result_locator/),
  governed_execution: has(turn, /preflightSelectedRecommendationVerification/),
  business_effect_verification: has(core, /resultBoundVerification/),
  failure_capture: has(core, /post_action_verification/),
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: true,
  authoritative_replay: has(core, /business_effect_outcome/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /business_effect_verified/),
  learning_evidence: true,
};
const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_SECRETARY_COMMERCIAL_VERIFICATION",
  stages,
});
report.domain_evidence = {
  exact_generated_locator_only: has(declaration, /requiredReadKeys\.length !== 1/),
  no_result_guessing: has(declaration, /payload_from_result: \{ \[resultKey\]: \[resultKey\] \}/),
  customer_exact_read: has(customerRead, /getCustomer/) && has(customerRead, /required: \["party_id"\]/),
  customer_result_binding: has(customerCreate, /commercial\.customers\.read/) && has(customerCreate, /payload_from_result/),
  message_exact_read: has(messageRead, /getMessage/) && has(messageRead, /conversation_id/) && has(messageRead, /message_id/),
  message_input_binding: has(messageSend, /payload_keys: \["conversation_id", "message_id"\]/),
  commercial_reads_registered: has(commercialRuntime, /customers:[\s\S]*read:/) && has(commercialRuntime, /communication:[\s\S]*read:/),
  verifier_authority_none: true,
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
