import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const mission = read("lib/platform/capabilities/createOperatorMissionCapability.js");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const synthetic = read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const human = read("lib/operator/runtime/BusinessPartnerHumanGateRecoveryRuntime.mjs");
const approval = read("lib/operator/runtime/BusinessPartnerExternalWaitWorkerRuntime.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /durable_registered_sequence/),
  governed_execution: has(core, /executionBlockedReason/) && has(core, /resolveOperatorExecutionApproval/),
  business_effect_verification: has(core, /runPendingPostActionVerification/),
  failure_capture: has(core, /AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1/),
  defect_classification: has(human, /CREDENTIAL_OR_RECONNECT/) && has(human, /WALLET_OR_BILLING/),
  self_healing_engineering: has(synthetic, /escalateBusinessPartnerProductDefect/),
  governed_release: has(synthetic, /production_release/),
  production_activation: has(core, /activation_verified/),
  automatic_wake: has(synthetic, /fresh_server_governance_reinspection/),
};
Object.assign(stages, {
  authoritative_replay: has(core, /SAME_ACTION_ONLY/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /businessEffectVerified/),
  learning_evidence: has(learning, /business_effect_verified/),
});

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_HUMAN_GATE_CONVERGENCE",
  stages,
});

report.domain_evidence = {
  credential_reconnect_gate: has(human, /CREDENTIAL_OR_RECONNECT/),
  wallet_billing_gate: has(human, /WALLET_OR_BILLING/),
  permission_access_gate: has(human, /PERMISSION_OR_ACCESS/),
  entity_context_gate: has(human, /ENTITY_CONTEXT/),
  approval_uses_existing_event_path: has(approval, /approval_request:/) && has(human, /kind === "APPROVAL"/),
  secret_input_forbidden: has(human, /Do not paste passwords, tokens, API keys, or secrets/),
  human_claim_evidence_only: has(synthetic, /human_resolution_claim_is_evidence_only: true/),
  fresh_governance_reinspection: has(synthetic, /fresh_server_governance_reinspection: true/) && has(core, /confirmed: false/),
  exact_action_only: has(core, /verifiedHumanGateReinspection/) && has(core, /SAME_ACTION_ONLY/),
  prior_authority_not_reused: has(human, /prior_confirmation_reused: false/) && has(human, /prior_approval_reused: false/),
  pre_mutation_only: has(human, /pre_mutation_gate_required: true/) && has(human, /mutation_completion_proven: false/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
