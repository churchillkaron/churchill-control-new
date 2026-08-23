import { readFile } from "node:fs/promises";

const handoffPath =
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js";
const cyclePath =
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js";
const persistenceDecisionPath =
  "lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime.js";
const repositoryCapabilityPath =
  "lib/platform/capabilities/createProductRepositoryAssessmentCapability.js";
const repositoryRuntimePath =
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js";

const files = Object.fromEntries(
  await Promise.all(
    [
      handoffPath,
      cyclePath,
      persistenceDecisionPath,
      repositoryCapabilityPath,
      repositoryRuntimePath,
    ].map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

function requireFragments(label, source, fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT:${label} missing ${fragment}`,
      );
    }
  }
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) return source.slice(startIndex);
  return source.slice(startIndex, endIndex);
}

function count(source, fragment) {
  return source.split(fragment).length - 1;
}

const persistenceDecision = files[persistenceDecisionPath];
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
const staleDecisionBranch = section(
  persistenceDecision,
  "if (recovery.stale_base)",
  "const deterministic = deterministicDecision(state)",
);
if (
  !staleDecisionBranch ||
  staleDecisionBranch.includes('decision: "REQUEST_COMMIT_CONFIRMATION"') ||
  staleDecisionBranch.includes("commitVerifiedCodeMission")
) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale persistence must remain fail-closed STAY_LOCAL and must not commit or retry",
  );
}

const repositoryCapability = files[repositoryCapabilityPath];
requireFragments("repository-capability", repositoryCapability, [
  'capability: "product_repository_assessment"',
  'action: "read"',
  'ref: "main"',
  'operatorMode: "read"',
  'operatorAutoExecute: true',
  'operatorRequiresConfirmation: false',
  'transactional: false',
]);
const repositoryRuntime = files[repositoryRuntimePath];
requireFragments("repository-runtime", repositoryRuntime, [
  "CodeWorkspaceSandboxRuntime.open",
  "workspace.inspect()",
  "current_main_head: currentHead",
  'authorization: { allow_mutating_tools: false }',
  "repository_evidence_read_only: true",
  'status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION"',
  'capability_key: "platform.product_engineering_cycle.execute"',
  "automatic_execution_started: false",
  'authorization_effect: "NONE"',
  "await workspace.stop()",
]);

const handoff = files[handoffPath];
requireFragments("handoff", handoff, [
  'const STALE_BASE_REPLAN_REASON = "STALE_BASE_REPLAN_REQUIRED"',
  "function staleBaseReplanMission",
  'id: "reassess_current_main_after_stale_base"',
  'capability_key: "platform.product_repository_assessment.read"',
  "const staleBaseReplanRequired =",
  'decision?.decision === "STAY_LOCAL"',
  "decision?.reason_code === STALE_BASE_REPLAN_REASON",
  "decision?.persistence?.stale_base_replan_required === true",
  'source: "AVANTIQO_PRODUCT_PERSISTENCE_STALE_BASE_REPLAN"',
  'status: "STALE_BASE_REPLAN_READY"',
  "PRODUCT_PERSISTENCE_HANDOFF_STALE_BASE_NEXT_OBJECTIVE_REQUIRED",
  "stale_persistence_rejected: true",
  "stale_patch_reused: false",
  "current_main_reassessment_count: 1",
  "current_main_reassessment_read_only: true",
  "fresh_next_engineering_handoff_count: 1",
  "automatic_execution_started: false",
  "automatic_recursion_allowed: false",
]);

const staleMission = section(
  handoff,
  "function staleBaseReplanMission",
  "function alreadyPersistedContinuationMission",
);
if (!staleMission) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale-base mission missing",
  );
}
if (count(staleMission, "capability_key:") !== 1) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale-base mission must contain exactly one capability invocation",
  );
}
for (const forbidden of [
  "platform.code_ai_commit.execute",
  "platform.code_ai_commit_status.verify",
  "platform.code_ai_autonomous.execute",
  "platform.product_engineering_cycle.execute",
  "platform.product_autonomy_continuation.assess",
  "verify_after",
  "bindings",
]) {
  if (staleMission.includes(forbidden)) {
    throw new Error(
      `OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale-base mission must remain one read-only reassessment; found ${forbidden}`,
    );
  }
}

const staleHandoffBranch = section(
  handoff,
  "if (staleBaseReplanRequired)",
  'if (decision.decision === "STAY_LOCAL")',
);
if (!staleHandoffBranch) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale-base handoff branch missing before ordinary STAY_LOCAL",
  );
}
if (count(staleHandoffBranch, "executeProductMission({") !== 1) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale-base branch must execute exactly one bounded reassessment mission",
  );
}
for (const forbidden of [
  "persistenceMission({",
  "alreadyPersistedContinuationMission({",
  'capability_key: "platform.code_ai_commit.execute"',
  'capability_key: "platform.code_ai_autonomous.execute"',
  'capability_key: "platform.product_engineering_cycle.execute"',
]) {
  if (staleHandoffBranch.includes(forbidden)) {
    throw new Error(
      `OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: stale-base branch must not reuse stale work or start writes; found ${forbidden}`,
    );
  }
}
requireFragments("stale-handoff-result", staleHandoffBranch, [
  "stalePatchAuthoritative: false",
  "stalePatchReuseAllowed: false",
  "next_engineering_handoff: {",
  "automatic_execution_started: false",
  "authorization_effect: \"NONE\"",
  "commit_executed: false",
  "stale_patch_reused: false",
  "next_engineering_cycle_started: false",
  "commit_allowed: false",
  "production_deployment_allowed: false",
  "database_migration_execution_allowed: false",
  "automatic_recursion_allowed: false",
]);

const ordinaryStayLocalBranch = section(
  handoff,
  'if (decision.decision === "STAY_LOCAL")',
  'if (decision.decision === "ALREADY_PERSISTED")',
);
requireFragments("ordinary-stay-local", ordinaryStayLocalBranch, [
  'status: "STAY_LOCAL"',
  "mission: null",
  "continuation: null",
  "next_engineering_handoff: null",
  "bounded_next_cycle_count: 0",
  "commit_executed: false",
]);
for (const forbidden of [
  "executeProductMission({",
  "staleBaseReplanMission({",
  "platform.product_repository_assessment.read",
]) {
  if (ordinaryStayLocalBranch.includes(forbidden)) {
    throw new Error(
      `OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: ordinary STAY_LOCAL must remain a true stop; found ${forbidden}`,
    );
  }
}

const requestCommitBranch = section(
  handoff,
  'if (decision.decision !== "REQUEST_COMMIT_CONFIRMATION")',
  "return { manifest, authorize, execute }",
);
requireFragments("request-commit", requestCommitBranch, [
  "governedCommitMessage(",
  "PRODUCT_PERSISTENCE_HANDOFF_COMMIT_MESSAGE_REQUIRED",
  "steps: persistenceMission({",
  'source: "AVANTIQO_PRODUCT_PERSISTENCE_HANDOFF"',
  "explicit_commit_confirmation_preserved: true",
  "commit_permission_enforced_by_registered_commit_step_preflight: true",
  "registered_commit_verification_required: true",
]);

const cycle = files[cyclePath];
requireFragments("cycle", cycle, [
  "function persistenceHandoffState(decision)",
  'decision?.decision === "REQUEST_COMMIT_CONFIRMATION"',
  'decision?.decision === "STAY_LOCAL"',
  "decision?.reason_code === STALE_BASE_REPLAN_REASON",
  "decision?.persistence?.stale_base_replan_required === true",
  "const persistenceState = persistenceHandoffState(decision)",
  "persistenceState === \"REQUEST_COMMIT_CONFIRMATION\"",
  "stale_base_replan_required: staleBaseReplanRequired",
  "stale_base_reassessment_completed: staleBaseReassessmentCompleted",
  "next_engineering_handoff: nextEngineeringHandoff",
  "automatic_execution_started: false",
  "ordinary_stay_local_triggers_persistence_handoff: false",
  "stale_patch_reuse_allowed: false",
  "stale_base_reassessment_count_maximum: 1",
  "stale_base_reassessment_starts_engineering: false",
  "automatic_recursion_allowed: false",
]);

const triggerFunction = section(
  cycle,
  "function persistenceHandoffState(decision)",
  "async function preparePersistenceHandoff",
);
if (
  !triggerFunction ||
  !triggerFunction.includes('return "REQUEST_COMMIT_CONFIRMATION"') ||
  !triggerFunction.includes("return STALE_BASE_REPLAN_REASON") ||
  !triggerFunction.includes("return null") ||
  triggerFunction.includes("ALREADY_PERSISTED")
) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: Product Engineering Cycle persistence handoff trigger must whitelist only REQUEST_COMMIT_CONFIRMATION and STALE_BASE_REPLAN_REQUIRED",
  );
}

const cycleHandoffCall = section(
  cycle,
  "const persistenceState = persistenceHandoffState(decision)",
  "const commitConfirmationPrepared",
);
if (count(cycleHandoffCall, "preparePersistenceHandoff({") !== 1) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: Product Engineering Cycle must make at most one persistence handoff call",
  );
}
requireFragments("cycle-handoff-call", cycleHandoffCall, [
  'text(missionResult?.status, 100) === "completed"',
  "persistenceState",
  "continuationFocus",
  'persistenceState === "REQUEST_COMMIT_CONFIRMATION"',
  ": null",
]);
if (
  cycleHandoffCall.includes('decision?.decision === "STAY_LOCAL"') ||
  cycleHandoffCall.includes('decision?.decision === "ALREADY_PERSISTED"')
) {
  throw new Error(
    "OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT: Product Engineering Cycle must not broadly continue ordinary STAY_LOCAL or ALREADY_PERSISTED results",
  );
}

console.log("OPERATOR_PRODUCT_STALE_BASE_REPLAN_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_STALE_BASE_PERSISTENCE=REJECTED_NO_COMMIT");
console.log("OPERATOR_PRODUCT_STALE_BASE_PATCH_REUSE=DISABLED");
console.log("OPERATOR_PRODUCT_STALE_BASE_REASSESSMENT=ONE_READ_ONLY_CURRENT_MAIN");
console.log("OPERATOR_PRODUCT_STALE_BASE_NEXT_OBJECTIVE=ONE_FRESH_HANDOFF_NO_AUTO_EXECUTION");
console.log("OPERATOR_PRODUCT_ORDINARY_STAY_LOCAL=TRUE_STOP");
console.log("OPERATOR_PRODUCT_REQUEST_COMMIT_CONFIRMATION=UNCHANGED_GOVERNED_PATH");
console.log("OPERATOR_PRODUCT_REPLAN_RECURSION=DISABLED");
