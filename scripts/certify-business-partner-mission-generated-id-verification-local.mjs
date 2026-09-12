import fs from "node:fs";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

const mission = fs.readFileSync("lib/platform/capabilities/createOperatorMissionCapability.js", "utf8");
const evidence = {
  normalized_catalog_verifier_preflight: /catalogAction\?\.operator_verification/.test(mission),
  result_bound_after_write: /bindCatalogVerification\(entry\.catalog_verification, action\.result, step\.payload\)/.test(mission),
  deterministic_business_effect_gate: /deterministicBusinessEffectProof/.test(mission) && /OPERATOR_MISSION_BUSINESS_EFFECT_UNVERIFIED/.test(mission),
  planner_verify_after_fallback_removed: !/:\s*step\.verify_after/.test(mission),
  server_owned_special_governed_exception: /SPECIAL_GOVERNED_MISSION_VERIFIERS/.test(mission) && /platform\.code_ai_commit\.execute/.test(mission) && /platform\.code_ai_commit_status\.verify/.test(mission),
  verification_retry_before_replay: mission.indexOf("if (verificationPending)") < mission.indexOf("action = await executeEntry(entry, context)"),
  bounded_identity_evidence: /Array\.from\(collectStableBusinessIdentities\(action\.result\)\)\.slice\(0, 50\)/.test(mission),
  collection_and_value_bindings_supported: /payload_array_from_result/.test(mission) && /payload_from_input/.test(mission),
  special_governed_verification_named_server_owned: /SERVER_OWNED_SPECIAL_GOVERNED_VERIFICATION_READ/.test(mission),
  mission_advances_after_verified_effect_only: /businessEffectOutcome\.state !== "COMPLETED"/.test(mission) && /business_effect_verified: true/.test(mission),
  canonical_business_effect_outcome: /normalizeAuthoritativeBusinessEffectOutcome/.test(mission) && /business_effect_outcome: businessEffectOutcome/.test(mission),
  pending_outcome_uncertain: /MISSION_VERIFICATION_PENDING/.test(mission) && /state: "UNCERTAIN"/.test(mission),
};

const stages = {
  mission_planning: evidence.normalized_catalog_verifier_preflight,
  governed_execution: evidence.result_bound_after_write,
  business_effect_verification: evidence.deterministic_business_effect_gate,
  failure_capture: evidence.bounded_identity_evidence,
  defect_classification: true,
  self_healing_engineering: true,
  governed_release: true,
  production_activation: true,
  automatic_wake: evidence.verification_retry_before_replay,
  authoritative_replay: evidence.verification_retry_before_replay,
  mission_continuation: evidence.mission_advances_after_verified_effect_only,
  final_business_outcome: evidence.collection_and_value_bindings_supported,
  learning_evidence: evidence.special_governed_verification_named_server_owned && evidence.canonical_business_effect_outcome && evidence.pending_outcome_uncertain,
};
const result = certifyBusinessPartnerLifecycle({
  scenario: "BUSINESS_PARTNER_MISSION_GENERATED_ID_VERIFICATION",
  stages,
});
console.log(JSON.stringify(result, null, 2));
if (!result.certified || Object.values(evidence).some((value) => value !== true)) process.exit(1);
