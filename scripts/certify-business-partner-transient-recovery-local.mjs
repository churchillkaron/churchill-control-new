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
const transient = read("lib/operator/runtime/BusinessPartnerTransientRecoveryPolicy.mjs");
const repair = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay = read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /durable_registered_sequence/),
  governed_execution: has(core, /resolveOperatorExecutionApproval/),
  business_effect_verification: has(core, /businessEffectVerified/),
  failure_capture: has(core, /AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1/),
  defect_classification: has(synthetic, /transientRecovery/),
  self_healing_engineering: has(repair, /executePlatformSelfHealingCodeMission/),
  governed_release: has(repair, /REQUEST_COMMIT_CONFIRMATION/),  production_activation: has(core, /activation_verified/),
  automatic_wake: has(synthetic, /transient_auto_retry_attempted/),
  authoritative_replay: has(core, /transient_recovery_receipt/) && has(replay, /SELF_HEALING_FIXED_VERIFIED/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /READ_RETRY_VERIFIED/),
  learning_evidence: has(learning, /recordBusinessPartnerRepairProductEvidence/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_TRANSIENT_RUNTIME_RECOVERY",
  stages,
});

report.domain_evidence = {
  transient_read_retry_only: has(transient, /retryableRead/) && has(transient, /read_only_retry:\s*true/),
  transient_write_replay_blocked: has(transient, /WRITE_OUTCOME_REINSPECTION_REQUIRED/) && has(transient, /auto_resume_allowed:\s*false/),
  single_attempt: has(synthetic, /transient_auto_retry_single_attempt/),
  same_action_only: has(transient, /SAME_ACTION_ONLY/),
  mission_failure_phase_preserved: has(core, /failure_evidence:\s*evidence/),
  code_replay_separated: has(core, /if \(!configurationRecoveryResume\)/) && has(core, /if \(!transientRecoveryResume\)/),
  current_governance_preserved: has(core, /resolveOperatorExecutionApproval/),
  ambiguous_mutation_not_replayed: has(mission, /mutation_completion_proven:\s*false/),
  no_authority_grant: has(transient, /authorization_effect:\s*"NONE"/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;