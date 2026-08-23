import { readFile } from "node:fs/promises";

const cyclePath =
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js";
const handoffPath =
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js";
const intelligencePath =
  "lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js";
const persistenceDecisionPath =
  "lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime.js";

const [cycle, handoff, intelligence, persistenceDecision] = await Promise.all([
  readFile(cyclePath, "utf8"),
  readFile(handoffPath, "utf8"),
  readFile(intelligencePath, "utf8"),
  readFile(persistenceDecisionPath, "utf8"),
]);

function requireFragments(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION:${label} missing ${fragment}`,
      );
    }
  }
}

requireFragments("cycle", cycle, [
  'id: "assess_repository"',
  'capability_key: "platform.product_repository_assessment.read"',
  'source_path: "next_engineering_handoff.focus"',
  'target_path: "objective"',
  "continuation_focus",
  "const continuationFocus = text(payload.continuation_focus, 2000) || null",
  "continuationFocusExplicitlyRequested: Boolean(continuationFocus)",
  "completedEngineeringFocusAutomaticallyReused: false",
  "completed_engineering_focus_automatically_reused: false",
  "continuation_focus_explicitly_applied: Boolean(continuationFocus)",
  "completed_engineering_focus_automatically_reused_for_next_objective: false",
  "continuation_focus_requires_explicit_input: true",
  "incoming_focus_is_authority: false",
  "direct_commit_step_allowed_in_engineering_mission: false",
  'forbidden_direct_commit_capability_key: "platform.code_ai_commit.execute"',
  '"platform.code_ai_commit_status.verify"',
  "commit_is_only_allowed_inside_persistence_handoff: true",
  "caller_commit_request_cannot_override_stay_local: true",
  'const DEPLOY_MARKER = "[deploy-production-final]"',
  "governedCommitMessage",
  'replaceAll(DEPLOY_MARKER, "")',
  "const rawCommitMessage = text(payload.commit_message, 200) || null",
  "const commitMessage = governedCommitMessage(rawCommitMessage)",
  "callerCommitProductionMarkerPreserved: false",
  "caller_commit_message_sanitized: commitMessageSanitized",
  "production_deploy_marker_preserved: false",
  "caller_commit_message_sanitized_before_handoff: true",
  "production_deploy_marker_preserved_from_caller_commit_message: false",
]);

const missionStepsSource = cycle.slice(
  cycle.indexOf("function missionSteps"),
  cycle.indexOf("function missionStep("),
);
if (!missionStepsSource) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION:cycle missionSteps source missing",
  );
}
for (const forbidden of [
  'platform.code_ai_commit.execute',
  'platform.code_ai_commit_status.verify',
  'platform.product_autonomy.assess',
  'continuation_focus',
  '[deploy-production-final]',
]) {
  if (missionStepsSource.includes(forbidden)) {
    throw new Error(
      `OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION:cycle mission must not contain ${forbidden}`,
    );
  }
}

const handoffCallSource = cycle.slice(
  cycle.indexOf("async function preparePersistenceHandoff"),
  cycle.indexOf("export function createProductEngineeringCycleCapability"),
);
if (!handoffCallSource.includes("continuationFocus")) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION: explicit continuation focus must feed only the persistence handoff",
  );
}
if (handoffCallSource.includes("...(focus ? { focus }")) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION: completed current-cycle focus must not be forwarded into post-commit continuation",
  );
}
if (!handoffCallSource.includes("commitMessage")) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION: sanitized caller commit label must be the only commit label forwarded into persistence handoff",
  );
}
if (handoffCallSource.includes("rawCommitMessage")) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION: raw caller commit label must never reach persistence handoff",
  );
}

const suggestedMessageSource = cycle.slice(
  cycle.indexOf("const suggestedCommitMessage"),
  cycle.indexOf("return {", cycle.indexOf("const suggestedCommitMessage")),
);
if (
  !suggestedMessageSource ||
  !suggestedMessageSource.includes("governedCommitMessage(") ||
  suggestedMessageSource.includes("rawCommitMessage")
) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION: suggested commit message must be sanitized and must never echo the raw caller label",
  );
}

requireFragments("handoff", handoff, [
  "governedCommitMessage",
  'replaceAll(DEPLOY_MARKER, "")',
  "caller_commit_message_ignored: Boolean(requestedCommitMessage)",
  "caller_commit_request_authorization_effect: \"NONE\"",
  "product_intelligence_request_commit_confirmation_required: true",
  "privileged_production_marker_removed_from_commit_message: true",
]);

requireFragments("persistence-decision", persistenceDecision, [
  "error?.main_advanced_from_expected_base === true",
  "expected_base_commit: expectedBase",
  "current_main_head: currentMainHead",
  "if (recovery.stale_base)",
  'decision: "STAY_LOCAL"',
  'reason_code: "STALE_BASE_REPLAN_REQUIRED"',
  "stale_base_replan_required: true",
  "This artifact is stale for persistence and must not be retried against newer main.",
  "No duplicate or rebased commit is attempted automatically.",
]);

const stalePersistenceBranch = persistenceDecision.slice(
  persistenceDecision.indexOf("if (recovery.stale_base)"),
  persistenceDecision.indexOf("const deterministic = deterministicDecision(state)"),
);
if (
  !stalePersistenceBranch ||
  !stalePersistenceBranch.includes('decision: "STAY_LOCAL"') ||
  stalePersistenceBranch.includes('decision: "REQUEST_COMMIT_CONFIRMATION"') ||
  stalePersistenceBranch.includes("commitVerifiedCodeMission")
) {
  throw new Error(
    "OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION: stale attempted persistence must remain STAY_LOCAL and must not retry, rebase, or request commit confirmation",
  );
}

requireFragments("intelligence", intelligence, [
  "A previously surfaced post-commit objective is also context, not immutable authority.",
  "current_main_recheck_before_engineering_required: true",
  "focus_is_authority: false",
  "next_engineering_cycle_rechecks_current_main: true",
  "STALE_BASE_REPLAN_REQUIRED",
  "stale_attempted_artifact_requires_fresh_cycle: true",
  "stale_attempted_artifact_retry_allowed: false",
  "stale_attempted_artifact_auto_rebase_allowed: false",
  "stale_attempted_artifact_replacement_commit_allowed: false",
  "historical engineering evidence only",
]);

console.log("OPERATOR_PRODUCT_NEXT_OBJECTIVE_ISOLATION_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_CURRENT_CYCLE_FOCUS=THIS_CYCLE_ONLY");
console.log("OPERATOR_PRODUCT_CONTINUATION_FOCUS=EXPLICIT_ONLY");
console.log("OPERATOR_PRODUCT_COMPLETED_OBJECTIVE_AUTO_REUSE=DISABLED");
console.log("OPERATOR_PRODUCT_ENGINEERING_MISSION_DIRECT_COMMIT=DISABLED");
console.log("OPERATOR_PRODUCT_CALLER_COMMIT_REQUEST=NO_AUTHORIZATION_EFFECT");
console.log("OPERATOR_PRODUCT_CALLER_DEPLOY_MARKER=STRIPPED_BEFORE_HANDOFF_OR_ECHO");
console.log("OPERATOR_PRODUCT_STALE_ATTEMPTED_ARTIFACT=STAY_LOCAL_REPLAN_CURRENT_MAIN");
console.log("OPERATOR_PRODUCT_STALE_ATTEMPT_RETRY_REBASE_REPLACEMENT=DISABLED");
