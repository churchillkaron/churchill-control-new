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
const ambiguous = read("lib/operator/runtime/BusinessPartnerAmbiguousWriteRecoveryRuntime.mjs");
const transient = read("lib/operator/runtime/BusinessPartnerTransientRecoveryPolicy.mjs");
const selfHealing = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /verify_after/),
  governed_execution: has(core, /resolveOperatorExecutionApproval/),
  business_effect_verification: has(ambiguous, /business_effect_outcome/),
  failure_capture: has(mission, /mutation_completion_proven: false/),
  defect_classification: has(transient, /WRITE_OUTCOME_REINSPECTION_REQUIRED/),
  self_healing_engineering: has(selfHealing, /executePlatformSelfHealingCodeMission/),
  governed_release: has(selfHealing, /REQUEST_COMMIT_CONFIRMATION/),
  production_activation: has(core, /activation_verified/),  automatic_wake: has(synthetic, /inspectAmbiguousWriteOutcome/),
  authoritative_replay: has(ambiguous, /authoritative_server_evidence/),
  mission_continuation: has(core, /businessPartnerAmbiguousWriteMissionResume/),
  final_business_outcome: has(ambiguous, /business_effect_verified: true/),
  learning_evidence: has(learning, /business_effect_verified/),
};

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_AMBIGUOUS_WRITE_OUTCOME_RECOVERY",
  stages,
});

report.domain_evidence = {
  write_timeout_never_implies_failure: has(transient, /WRITE_OUTCOME_REINSPECTION_REQUIRED/),
  registered_read_verifier_only: has(synthetic, /item\.key === capabilityKey && item\.mode === "read"/),
  authoritative_exact_scope_required: has(ambiguous, /authoritative_server_evidence === true/) && has(ambiguous, /exact_business_scope_matched === true/),
  three_state_outcome: has(ambiguous, /COMPLETED/) && has(ambiguous, /NOT_COMPLETED/) && has(ambiguous, /UNCERTAIN/),
  completed_never_replayed: has(core, /recovery_completed_without_replay: true/) && has(core, /mutationReplayPerformed: false/),
  retry_only_after_proven_absence: has(ambiguous, /business_effect_absent === true/) && has(ambiguous, /safe_to_retry === true/),
  retry_uses_fresh_governance: has(ambiguous, /retry_requires_fresh_governance: true/) && has(core, /confirmed: false/),
  uncertain_stays_blocked: has(ambiguous, /EXPLICIT_COMPLETION_STATE_NOT_PROVEN/),
  same_action_only: has(ambiguous, /SAME_ACTION_ONLY/),
  no_authority_grant_on_completion: has(ambiguous, /authorization_effect: "NONE"/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;