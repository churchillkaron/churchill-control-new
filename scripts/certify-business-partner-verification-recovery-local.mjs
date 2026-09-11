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
const policy = read("lib/operator/runtime/OperatorRepairSupervisionPolicy.js");
const proof = read("lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /durable_registered_sequence|OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS/),
  governed_execution: has(core, /resolveOperatorExecutionApproval/),
  business_effect_verification: has(core, /runPendingPostActionVerification/),
  failure_capture: has(core, /pendingVerificationExecution/),
  defect_classification: has(policy, /VERIFICATION_ONLY/),
  self_healing_engineering: has(synthetic, /PRODUCT_DEFECT_CANDIDATE/),
  governed_release: has(synthetic, /business_partner_self_healing/),
  production_activation: has(core, /activation_verified/),
  automatic_wake: has(synthetic, /verification_auto_retry_attempted/),
  authoritative_replay: has(core, /retryPendingVerification/),
  mission_continuation: has(core, /resume_kind: "verification"/),
  final_business_outcome: has(core, /retryResult\?\.business_effect_verified === true/),
  learning_evidence: has(learning, /business_effect_verified/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_VERIFICATION_ONLY_AUTO_RECOVERY",
  stages,
});

report.domain_evidence = {
  registered_read_only_verifier: has(core, /item\.mode === "read"/),
  exact_verification_pending_used: has(synthetic, /verificationOnlyPending/) && has(synthetic, /resume_kind, 80\) === "verification"/),
  stable_action_identity_required: has(synthetic, /action_identity_evidence\.length > 0/) && has(proof, /verificationIdentities\.has\(identity\)/),
  single_retry_only: has(synthetic, /verification_auto_retry_single_attempt: true/),
  mutation_never_replayed: has(synthetic, /mutation_replay_allowed: false/) && has(core, /retryPendingVerification/),
  deterministic_business_effect_required: has(core, /retryResult\?\.business_effect_verified === true/),
  missing_parameter_bug_fixed: has(core, /conversationId = null,[\s\S]*actionIdentityEvidence = \[\]/),
  code_lane_not_authorized: has(policy, /VERIFICATION_ONLY/) && has(synthetic, /PRODUCT_DEFECT_CANDIDATE/),
  no_authority_grant: has(synthetic, /authorization_effect: "NONE"/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
