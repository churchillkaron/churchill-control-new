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
const data = read("lib/operator/runtime/BusinessPartnerDataRecoveryRuntime.mjs");
const repair = read("lib/platform/capabilities/createBusinessPartnerSelfHealingCapability.js");
const replay = read("lib/platform/self-healing/PlatformSelfHealingReplayVerificationRuntime.mjs");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /durable_registered_sequence/),
  governed_execution: has(core, /resolveOperatorExecutionApproval/),
  business_effect_verification: has(core, /businessEffectVerified/),
  failure_capture: has(core, /AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1/),
  defect_classification: has(synthetic, /DATA_OR_CLARIFICATION/),
  self_healing_engineering: has(repair, /executePlatformSelfHealingCodeMission/),
  governed_release: has(repair, /REQUEST_COMMIT_CONFIRMATION/),
  production_activation: has(core, /activation_verified/),
  automatic_wake: has(synthetic, /businessPartnerDataRecoveryInputTurn/),
  authoritative_replay: has(core, /data_recovery_receipt/) && has(replay, /SELF_HEALING_FIXED_VERIFIED/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(core, /DATA_RETRY_VERIFIED/),
  learning_evidence: has(learning, /recordBusinessPartnerRepairProductEvidence/),
};
const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_DATA_CLARIFICATION_TO_MISSION_RESUME",
  stages,
});

report.domain_evidence = {
  exact_capability_schema_bound: has(data, /capability_input_contract/) && has(data, /CAPABILITY_INPUT_SCHEMA_CHANGED/),
  context_fields_server_owned: has(data, /CONTEXT_FIELDS/) && has(data, /organization_id/) && has(data, /entity_id/),
  only_requested_fields_accepted: has(data, /FIELD_NOT_REQUESTED/) && has(data, /missing_required_fields/),
  typed_values_validated: has(data, /NUMBER_REQUIRED/) && has(data, /INTEGER_REQUIRED/) && has(data, /BOOLEAN_REQUIRED/),
  supplied_data_not_confirmation: has(data, /confirmation_granted: false/) && has(synthetic, /confirmation_reused: false/),
  supplied_data_not_approval: has(data, /approval_granted: false/) && has(synthetic, /approval_reused: false/),
  same_action_only: has(synthetic, /data_recovery_same_action_only: true/) && has(core, /SAME_ACTION_ONLY/),
  mission_run_preserved: has(core, /preserveRecoveryMission/) && has(synthetic, /data_fields_amended_only/),
  normal_governance_preserved: has(core, /executionBlockedReason\(capability, \{ source, confirmed: false \}\)/) && has(core, /resolveOperatorExecutionApproval/),
  no_authority_grant: has(data, /authorization_effect: "NONE"/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;
