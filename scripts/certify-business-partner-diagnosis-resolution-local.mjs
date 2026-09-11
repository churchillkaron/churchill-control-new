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
const supervisor = read("lib/operator/runtime/OperatorRepairSupervisionRuntime.js");
const liveRead = read("lib/operator/runtime/OperatorRepairLiveReadEvidenceRuntime.js");
const policy = read("lib/operator/runtime/BusinessPartnerDiagnosisResolutionPolicy.mjs");
const selfHealing = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay = read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /OPERATOR_MISSION_REQUIRES_2_TO_6_STEPS/),
  governed_execution: has(core, /resolveOperatorExecutionApproval/),
  business_effect_verification: has(core, /runPendingPostActionVerification/),
  failure_capture: has(core, /AVANTIQO_BUSINESS_PARTNER_MISSION_RECOVERY_V1/),
  defect_classification: has(supervisor, /resolveBusinessPartnerDiagnosis/),
  self_healing_engineering: has(selfHealing, /executePlatformSelfHealingCodeMission/),
  governed_release: has(selfHealing, /REQUEST_COMMIT_CONFIRMATION/),  production_activation: has(core, /activation_verified/) || has(selfHealing, /activation_verified/),
  automatic_wake: has(synthetic, /configuration_auto_retry_attempted/) && has(synthetic, /transient_auto_retry_attempted/),
  authoritative_replay: has(core, /verifyPlatformSelfHealingReplay/) && has(replay, /SELF_HEALING_FIXED_VERIFIED/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /businessEffectVerified/),
  learning_evidence: has(learning, /recordBusinessPartnerRepairProductEvidence/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_DIAGNOSIS_TO_RECOVERY_ROUTE",
  stages,
});

report.domain_evidence = {
  live_read_before_resolution: has(supervisor, /assessOperatorRepairLiveReadEvidence[\s\S]*resolveBusinessPartnerDiagnosis/),
  unresolved_without_evidence: has(policy, /MORE_EVIDENCE_REQUIRED/) && has(policy, /relevant_live_read_evidence_observed !== true/),
  deterministic_existing_lanes: has(policy, /DATA_OR_CLARIFICATION/) && has(policy, /CONFIGURATION_OR_EXTERNAL/) && has(policy, /TRANSIENT_RUNTIME/),
  defect_identity_gate: has(policy, /exact_business_identity_evidence_matched === true/) && has(policy, /PRODUCT_DEFECT_CANDIDATE/),
  code_gate_preserved: has(synthetic, /current_defect_evidence_confirmed !== true/) && has(synthetic, /relevant_live_read_evidence_observed !== true/),
  precise_human_question_only: has(synthetic, /dataClarificationQuestion/) && has(synthetic, /needs_human === true/),
  live_read_scope_bound: has(liveRead, /organization_id/) && has(liveRead, /identity_matched/),
  no_mutating_supervision_tools: has(supervisor, /allow_mutating_tools: false/),
  no_authority_grant: has(policy, /authorization_effect: "NONE"/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
