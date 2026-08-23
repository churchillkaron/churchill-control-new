import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const paths = [
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js",
  "lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js",
  "lib/operator/runtime/OperatorTurnRuntime.js",
  "lib/platform/capabilities/createProductRepositoryAssessmentCapability.js",
  "lib/platform/capabilities/createCodeAICommitStatusCapability.js",
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js",
  "lib/platform/capabilities/createProductAutonomyContinuationCapability.js",
  "lib/platform/runtime/PlatformDomainRuntime.js",
];

const files = Object.fromEntries(
  await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])),
);

function requireFragments(path, fragments) {
  const source = files[path];
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(`PRODUCT_REPOSITORY_CONTINUATION_AUDIT:${path} missing ${fragment}`);
    }
  }
}

const repositoryRuntimePath =
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js";
requireFragments(repositoryRuntimePath, [
  "AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_V1",
  "CodeWorkspaceSandboxRuntime.open",
  'ref: text(ref, 160) || DEFAULT_REF',
  "workspace.inspect()",
  "PRODUCT_REPOSITORY_ASSESSMENT_WORKSPACE_NOT_CLEAN",
  "current_main_head: currentHead",
  "verified_commit_is_current_head",
  "main_advanced_after_verified_commit",
  "bounded_repository_evidence: true",
  "full_repository_certification: false",
  'authorization: { allow_mutating_tools: false }',
  "repository_evidence_read_only: true",
  'status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION"',
  'capability_key: "platform.product_engineering_cycle.execute"',
  "repository_head_observed: currentHead",
  "automatic_execution_started: false",
  'authorization_effect: "NONE"',
  "await workspace.stop()",
]);

requireFragments(
  "lib/platform/capabilities/createProductRepositoryAssessmentCapability.js",
  [
    'capability: "product_repository_assessment"',
    'action: "read"',
    "assessAvantiqoCurrentRepository",
    'ref: "main"',
    'operatorMode: "read"',
    'operatorAutoExecute: true',
    'operatorRequiresConfirmation: false',
    'risk: "low"',
    'transactional: false',
  ],
);

requireFragments(
  "lib/platform/capabilities/createCodeAICommitStatusCapability.js",
  [
    'REQUIRED_PERMISSION = "platform.code.ai.execute"',
    'capability: "code_ai_commit_status"',
    'action: "verify"',
    'operatorMode: "read"',
    'operatorAutoExecute: true',
    'operatorRequiresConfirmation: false',
    'risk: "low"',
    'transactional: false',
    "artifact.commit_attempted !== true",
  ],
);

const handoffPath =
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js";
requireFragments(handoffPath, [
  'permissions: [REQUIRED_EXECUTE_PERMISSION]',
  'source_step_id: "commit_verified_changes"',
  'source: "verification"',
  'source_path: "commit.commit_sha"',
  'target_path: "verified_commit_sha"',
  'source_path: "verification_source"',
  'target_path: "verified_commit_verification_source"',
  'source_path: "server_state_found"',
  'target_path: "verified_commit_server_state_found"',
  "alreadyPersistedContinuationMission",
  'id: "verify_existing_persistence"',
  'source_step_id: "verify_existing_persistence"',
  'source: "result"',
  'status: "READY_FOR_ONE_NEXT_BOUNDED_CYCLE"',
  "PRODUCT_PERSISTENCE_HANDOFF_ALREADY_PERSISTED_NEXT_OBJECTIVE_REQUIRED",
  "bounded_next_cycle_count: 1",
  "second_commit_allowed: false",
  "next_engineering_cycle_started: false",
  "automatic_execution_started: false",
  "commit_permission_enforced_by_registered_commit_step_preflight: true",
  "verified_commit_evidence_bound_to_continuation: true",
  "write_replay_for_verification_recovery_allowed: false",
]);
const alreadyPersistedMission = files[handoffPath].slice(
  files[handoffPath].indexOf("function alreadyPersistedContinuationMission"),
  files[handoffPath].indexOf("function missionStepCapabilityResult"),
);
if (
  !alreadyPersistedMission ||
  alreadyPersistedMission.includes('"platform.code_ai_commit.execute"') ||
  alreadyPersistedMission.includes('"platform.product_engineering_cycle.execute"')
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: ALREADY_PERSISTED continuation must remain read-only and must not execute another commit or engineering cycle",
  );
}
if ((alreadyPersistedMission.match(/capability_key:/g)?.length || 0) !== 2) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: ALREADY_PERSISTED continuation must remain exactly two registered read steps",
  );
}

const continuationPath =
  "lib/platform/capabilities/createProductAutonomyContinuationCapability.js";
requireFragments(continuationPath, [
  'capability: "product_autonomy_continuation"',
  'action: "assess"',
  "loadCodeAICommitExecutionState",
  "loadCodeAICommitArtifact",
  "assessAvantiqoCurrentRepository",
  "verifiedCommitSha",
  'RECOVERY_VERIFICATION_SOURCE = "GITHUB_RECOVERY_FROM_ATTESTED_ARTIFACT"',
  "trustedRecoveryBindingContext",
  'text(metadata.source, 160) === "AVANTIQO_OPERATOR_MISSION"',
  'text(metadata.parentCapabilityKey, 240) === "platform.operator_mission.execute"',
  'text(metadata.missionStepId, 240) === "reassess_verified_main"',
  '"platform.product_autonomy_continuation.assess"',
  "payload.verified_commit_server_state_found !== false",
  "PRODUCT_AUTONOMY_CONTINUATION_RECOVERY_ARTIFACT_REQUIRED",
  "artifact.commit_attempted !== true",
  "PRODUCT_AUTONOMY_CONTINUATION_RECOVERY_ATTEMPT_EVIDENCE_REQUIRED",
  "PRODUCT_AUTONOMY_CONTINUATION_BOUND_COMMIT_MISMATCH",
  'ref: "main"',
  "repositoryAssessment?.repository_snapshot",
  "current_main_head",
  "PRODUCT_AUTONOMY_CONTINUATION_CURRENT_MAIN_HEAD_REQUIRED",
  "PRODUCT_AUTONOMY_CONTINUATION_ENGINEERING_OBJECTIVE_REQUIRED",
  "main_advanced_after_verified_commit",
  "server_state_or_registered_verifier_binding_required: true",
  "recovery_binding_trusted_only_inside_exact_mission_step: true",
  "recovery_artifact_commit_attempt_marker_required: true",
  "write_replay_for_recovery_allowed: false",
  "repository_grounded_current_main_required: true",
  "bounded_next_cycle_count: 1",
  "automatic_recursion_allowed: false",
  "automatic_commit_allowed: false",
  "production_deployment_allowed: false",
  "database_migration_execution_allowed: false",
  "commit_message: null",
]);
const continuationSource = files[continuationPath];
for (const forbiddenLegacyExecution of [
  'from "@/lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime"',
  "await assessAvantiqoProductAutonomy(",
  "assessAvantiqoProductAutonomy({",
]) {
  if (continuationSource.includes(forbiddenLegacyExecution)) {
    throw new Error(
      `PRODUCT_REPOSITORY_CONTINUATION_AUDIT: post-commit continuation must not execute the process-only Product autonomy assessor: ${forbiddenLegacyExecution}`,
    );
  }
}

requireFragments(
  "lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js",
  [
    '"platform.product_repository_assessment.read"',
    "repository_reassessment_capability_key",
    "repository_grounded_post_commit_reassessment_required: true",
    "already_persisted_second_commit_allowed: false",
    "already_persisted_reverification_required: true",
    "next_engineering_cycle_started_automatically: false",
    "actual checked-out current main",
    "Repository checkout evidence is source evidence, not build, test, end-to-end, provider, deployment or certification evidence.",
  ],
);

const operatorTurnPath = "lib/operator/runtime/OperatorTurnRuntime.js";
requireFragments(operatorTurnPath, [
  "continuationCapabilityResult",
  "boundedContinuationHandoff",
  "postCommitContinuationHandoff",
  "capabilityKey === PRODUCT_PERSISTENCE_HANDOFF_KEY",
  "capabilityKey === PRODUCT_ENGINEERING_CYCLE_KEY",
  "object(executionResult.persistence_handoff)",
  "capabilityKey !== OPERATOR_MISSION_KEY",
  'text(step?.id) === "reassess_verified_main"',
  "continuationStep?.result",
  "handoff.automatic_execution_started === true",
  'source: "verified_persistence_handoff"',
  'source: "verified_post_commit_product_reassessment"',
  "agreementWithOperatorRecommendation",
  'payload: { focus: postCommitHandoff.focus }',
  "Verified persistence is complete.",
  'Say “next”, “continue”, or “do it”',
]);
const detectorSource = files[operatorTurnPath].slice(
  files[operatorTurnPath].indexOf("function postCommitContinuationHandoff"),
  files[operatorTurnPath].indexOf("function decisionText"),
);
if (
  detectorSource.includes("executeUbteCapability") ||
  detectorSource.includes("runOperatorTurnCore(") ||
  detectorSource.includes("platform.code_ai_commit.execute")
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: conversation continuation detector must only extract a recommendation and must not execute engineering or persistence",
  );
}

requireFragments("lib/platform/runtime/PlatformDomainRuntime.js", [
  "createProductRepositoryAssessmentCapability",
  "product_repository_assessment",
  "createProductPersistenceHandoffCapability",
  "createProductAutonomyContinuationCapability",
]);

const { listOperatorCapabilities } = await import(
  "@/lib/operator/runtime/OperatorCapabilityCatalog"
);
const capabilities = await listOperatorCapabilities();
const byKey = new Map(capabilities.map((capability) => [capability.key, capability]));

const repositoryAssessment = byKey.get("platform.product_repository_assessment.read");
if (!repositoryAssessment) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: repository assessment capability missing from Operator catalog",
  );
}
if (
  repositoryAssessment.mode !== "read" ||
  repositoryAssessment.risk !== "low" ||
  repositoryAssessment.auto_execute !== true ||
  repositoryAssessment.requires_confirmation === true ||
  repositoryAssessment.transactional === true ||
  !repositoryAssessment.permissions?.includes("platform.code.ai.execute")
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: repository assessment must remain low-risk read-only auto-executable evidence with code execution permission",
  );
}

const commitStatus = byKey.get("platform.code_ai_commit_status.verify");
if (
  !commitStatus ||
  commitStatus.mode !== "read" ||
  commitStatus.risk !== "low" ||
  commitStatus.auto_execute !== true ||
  commitStatus.requires_confirmation === true ||
  commitStatus.transactional === true ||
  !commitStatus.permissions?.includes("platform.code.ai.execute") ||
  commitStatus.permissions?.includes("platform.code.ai.commit")
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: commit verification must remain read-authority under code execution permission and must not require commit write permission",
  );
}

const persistenceHandoff = byKey.get("platform.product_persistence_handoff.execute");
if (
  !persistenceHandoff ||
  persistenceHandoff.risk !== "low" ||
  persistenceHandoff.auto_execute !== true ||
  persistenceHandoff.requires_confirmation === true ||
  persistenceHandoff.transactional === true ||
  !persistenceHandoff.permissions?.includes("platform.code.ai.execute") ||
  persistenceHandoff.permissions?.includes("platform.code.ai.commit")
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: Product persistence handoff must allow read-only decisions/continuation under execute authority while leaving commit permission to the registered write step",
  );
}

const continuation = byKey.get("platform.product_autonomy_continuation.assess");
if (!continuation) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: Product autonomy continuation capability missing",
  );
}
if (
  continuation.mode !== "read" ||
  continuation.risk !== "low" ||
  continuation.auto_execute !== true ||
  continuation.requires_confirmation === true ||
  continuation.transactional === true ||
  !continuation.permissions?.includes("platform.code.ai.execute")
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: post-commit continuation must remain a low-risk read-only bounded assessment",
  );
}

console.log("OPERATOR_PRODUCT_REPOSITORY_CONTINUATION_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE=FRESH_READ_ONLY_GITHUB_MAIN_CHECKOUT");
console.log("OPERATOR_PRODUCT_REPOSITORY_HEAD=OBSERVED_AND_EXPLICIT");
console.log("OPERATOR_PRODUCT_REPOSITORY_CONCURRENCY=NEWER_MAIN_PRESERVED");
console.log("OPERATOR_PRODUCT_REPOSITORY_NEXT_OBJECTIVE=NONEMPTY_BOUNDED_HANDOFF_REQUIRED");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY=REGISTERED_VERIFIER_BOUND_SCALARS_ONLY");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY_CONTEXT=EXACT_DURABLE_MISSION_STEP_ONLY");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY_ATTEMPT_MARKER=REQUIRED");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY_WRITE_REPLAY=DISABLED");
console.log("OPERATOR_PRODUCT_ALREADY_PERSISTED_CONTINUATION=TWO_READS_ONE_OBJECTIVE_NO_EXECUTION");
console.log("OPERATOR_PRODUCT_CONTINUATION_CONVERSATION=DIRECT_NESTED_OR_MISSION_RESULT_TO_SAFE_RECOMMENDATION");
console.log("OPERATOR_PRODUCT_CONTINUATION_CONVERSATION_AUTO_EXECUTION=DISABLED");
console.log("OPERATOR_CODE_AI_COMMIT_STATUS_AUTHORITY=EXECUTE_READ_ONLY_NOT_COMMIT_WRITE");
console.log("OPERATOR_PRODUCT_PERSISTENCE_HANDOFF_AUTHORITY=CONDITIONAL_WRITE_PERMISSION_AT_REGISTERED_STEP");
console.log("OPERATOR_PRODUCT_REPOSITORY_CERTIFICATION=SOURCE_EVIDENCE_ONLY");
console.log("OPERATOR_PRODUCT_AUTONOMY_RECURSION=DISABLED");
