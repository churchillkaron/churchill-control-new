import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const has = (source, pattern) => pattern.test(source);

const policy = read("lib/operator/runtime/BusinessPartnerConfigurationRecoveryPolicy.mjs");
const supervision = read("lib/operator/runtime/OperatorRepairSupervisionRuntime.js");
const synthetic = read("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js");
const core = read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
const repair = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay = read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(core, /businessPartnerRecoveryResumeAction/),
  governed_execution: has(core, /Resume exact original action after verified configuration recovery/),
  business_effect_verification: has(core, /businessEffectVerified/) && has(core, /runPendingPostActionVerification/),
  failure_capture: has(core, /AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1/),
  defect_classification: has(policy, /CONFIGURATION_OR_EXTERNAL/),
  self_healing_engineering: has(repair, /executePlatformSelfHealingCodeMission/),
  governed_release: has(repair, /REQUEST_COMMIT_CONFIRMATION/),
  production_activation: has(core, /activation_verified/),
  automatic_wake: has(synthetic, /configuration_auto_retry_attempted:\s*true/),
  authoritative_replay: has(core, /verifyPlatformSelfHealingReplay/) && has(replay, /SELF_HEALING_FIXED_VERIFIED/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /business_effect_verified:\s*true/),
  learning_evidence: has(learning, /recordBusinessPartnerRepairProductEvidence/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_CONFIGURATION_DEPENDENCY_RECOVERY",
  stages,
});

report.domain_evidence = {
  server_live_read_required:
    has(policy, /relevant_live_read_evidence_observed === true/) &&
    has(policy, /exact_business_identity_evidence_matched === true/),
  credential_secret_blocked: has(policy, /HUMAN_CREDENTIAL_REQUIRED/),
  external_dependency_blocked: has(policy, /EXTERNAL_DEPENDENCY_PENDING/),
  governance_blocked: has(policy, /GOVERNANCE_REQUIRED/),
  same_action_only: has(core, /authorization_effect\) !== "SAME_ACTION_ONLY"/),
  single_attempt: has(synthetic, /configuration_auto_retry_single_attempt:\s*true/),
  code_replay_separated: has(core, /if \(!configurationRecoveryResume\) \{/),
  current_governance_preserved: has(synthetic, /execution_governance_bypassed:\s*false/),
  supervisor_read_only: has(supervision, /allow_mutating_tools:\s*false/),
};

report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
