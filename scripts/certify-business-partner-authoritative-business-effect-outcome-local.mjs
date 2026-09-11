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
const outcome = read("lib/operator/runtime/BusinessEffectOutcomeRuntime.mjs");
const ambiguous = read("lib/operator/runtime/BusinessPartnerAmbiguousWriteRecoveryRuntime.mjs");
const operator = read("lib/operator/runtime/OperatorTurnRuntime.js");
const learning = read("lib/operator/runtime/BusinessPartnerProductEvidenceRuntime.js");

const stages = {
  mission_planning: has(mission, /verify_after/),
  governed_execution: has(core, /executeCapability/),
  business_effect_verification: has(core, /business_effect_outcome/) && has(outcome, /COMPLETED/),
  failure_capture: has(core, /AVANTIQO_BUSINESS_PARTNER_RECOVERY_STATE_V1/),
  defect_classification: has(ambiguous, /UNCERTAIN/),
  self_healing_engineering: has(synthetic, /escalateBusinessPartnerProductDefect/),
  governed_release: has(synthetic, /production_release/),
  production_activation: has(core, /activation_verified/),
};
Object.assign(stages, {
  automatic_wake: has(synthetic, /inspectAmbiguousWriteOutcome/),
  authoritative_replay: has(outcome, /authoritative_server_evidence/) && has(outcome, /exact_business_scope_matched/),
  mission_continuation: has(core, /businessPartnerMissionContinuation/),
  final_business_outcome: has(operator, /AVANTIQO_OPERATOR_VERIFIED_MUTATION_OUTCOME_V3/),
  learning_evidence: has(learning, /business_effect_verified/),
});

const report = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME",
  stages,
});

report.domain_evidence = {
  one_shared_outcome_contract: has(outcome, /AVANTIQO_AUTHORITATIVE_BUSINESS_EFFECT_OUTCOME_V1/) && has(core, /normalizeAuthoritativeBusinessEffectOutcome/) && has(ambiguous, /normalizeAuthoritativeBusinessEffectOutcome/),
  server_bound_scope_required: has(outcome, /server_scope_bound === true/) && has(synthetic, /server_scope_bound:\s*true/),
  stable_identity_completion_proof: has(outcome, /SERVER_BOUND_STABLE_BUSINESS_IDENTITY_MATCH/),
  contextual_input_identity_not_used: has(outcome, /expectedSource\.action_result/) && !has(outcome, /stableIdentities\(expected,/),
  string_identity_supported: has(outcome, /typeof value === "string"/),
  empty_lookup_not_absence: has(outcome, /business_effect_absent:\s*false/) && has(outcome, /safe_to_retry:\s*false/),
  explicit_absence_only: has(outcome, /explicitState === "NOT_COMPLETED"/) && has(outcome, /explicit\.business_effect_absent === true/) && has(outcome, /explicit\.safe_to_retry === true/),
  normal_write_emits_outcome: has(core, /business_effect_outcome:/),
  ambiguous_write_consumes_outcome: has(ambiguous, /const evidence = normalizeAuthoritativeBusinessEffectOutcome/),
  failure_receipt_identity_supported: has(mission, /action_identity_evidence: Array\.isArray\(error\?\.action_identity_evidence\)/),
  completed_never_replayed: has(ambiguous, /mutation_replay_allowed:\s*false/),
  not_completed_requires_fresh_governance: has(ambiguous, /retry_requires_fresh_governance:\s*true/),
  canonical_verified_mutation_preserved: has(operator, /VERIFIED_MUTATION_OUTCOME_CONTRACT/),
};
report.certified = report.certified && Object.values(report.domain_evidence).every(Boolean);
report.status = report.certified ? "CERTIFIED" : "CERTIFICATION_BLOCKED";
console.log(JSON.stringify(report, null, 2));
if (!report.certified) process.exitCode = 1;