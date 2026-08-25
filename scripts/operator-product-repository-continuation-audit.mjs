import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const paths = [
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js",
  "lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js",
  "lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime.js",
  "lib/operator/runtime/OperatorTurnRuntimeLegacy.js",
  "lib/platform/capabilities/createProductRepositoryAssessmentCapability.js",
  "lib/platform/capabilities/createCodeAICommitStatusCapability.js",
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js",
  "lib/platform/capabilities/createProductAutonomyContinuationCapability.js",
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js",
  "lib/platform/capabilities/createCodeAIAutonomousCapability.js",
  "lib/code/runtime/CodeAIAutonomousRuntime.js",
  "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js",
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
  "MAX_OBJECTIVE_COMPLETION_CRITERIA = 6",
  ".slice(0, MAX_OBJECTIVE_COMPLETION_CRITERIA)",
  "maximum_completion_criteria: MAX_OBJECTIVE_COMPLETION_CRITERIA",
  "one to six concrete evidence-verifiable acceptance criteria",
  "bounded_repository_evidence: true",
  "full_repository_certification: false",
  'authorization: { allow_mutating_tools: false }',
  "repository_evidence_read_only: true",
  'status: "REPOSITORY_ASSESSMENT_ONLY_NOT_CERTIFICATION"',
  'capability_key: "platform.product_engineering_cycle.execute"',
  "repository_head_observed: currentHead",
  "objective_selection_contract: objectiveSelection.contract",
  "selected_candidate_id: objectiveSelection.selected_candidate_id",
  "objective_selection_score: objectiveSelection.selected_weighted_score",
  "objective_selection_evidence_backed: true",
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

const cyclePath =
  "lib/platform/capabilities/createProductEngineeringCycleCapability.js";
requireFragments(cyclePath, [
  'id: "assess_repository"',
  'capability_key: "platform.product_repository_assessment.read"',
  'source_step_id: "assess_repository"',
  'source_path: "next_engineering_handoff.focus"',
  'target_path: "objective"',
  'source_path: "next_engineering_handoff.repository_head_observed"',
  'target_path: "objective_context.repository_head_observed"',
  'source_path: "next_engineering_handoff.objective_selection_contract"',
  'target_path: "objective_context.selection_contract"',
  'source_path: "next_engineering_handoff.selected_candidate_id"',
  'target_path: "objective_context.selected_candidate_id"',
  'source_path: "next_engineering_handoff.objective_selection_score"',
  'target_path: "objective_context.selection_score"',
  'source_path: "next_engineering_handoff.objective_selection_evidence_backed"',
  'target_path: "objective_context.evidence_backed"',
  'source_path: "objective_selection.selected_completion_criteria.0"',
  'target_path: "objective_context.completion_criterion_1"',
  'source_path: "objective_selection.selected_completion_criteria.5"',
  'target_path: "objective_context.completion_criterion_6"',
  "product_completion_criteria_bound_to_code_ai: true",
  "product_completion_criteria_maximum: 6",
  "missionStepCapabilityResult",
  "repositoryAssessment",
  "repository_head_observed",
  "PRODUCT_ENGINEERING_CYCLE_MAIN_ONLY",
  "repositoryGroundedAssessmentRequired: true",
  "currentMainRecheckBeforeEngineeringRequired: true",
  "repository_grounded_assessment_required: true",
  "current_main_rechecked_before_engineering",
  "repository_source_evidence_is_certification: false",
  "incoming_focus_is_authority: false",
  "product_objective_provenance_bound_to_code_ai: true",
  'product_objective_provenance_authorization_effect: "NONE"',
  "automaticRecursionAllowed: false",
]);
if (files[cyclePath].includes('capability_key: "platform.product_autonomy.assess"')) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: the next engineering cycle must recheck actual current main rather than replace the repository-grounded objective with a process-only Product autonomy assessment",
  );
}
const cycleMissionSource = files[cyclePath].slice(
  files[cyclePath].indexOf("function missionSteps"),
  files[cyclePath].indexOf("function missionStep("),
);
if ((cycleMissionSource.match(/source_step_id: "assess_repository"/g)?.length || 0) !== 12) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: Product-to-Code handoff must remain exactly twelve governed scalar bindings: objective, five provenance values and six completion criteria",
  );
}
for (const requiredBindingFragment of [
  'source_path: "objective_selection.selected_completion_criteria.0"',
  'target_path: "objective_context.completion_criterion_1"',
  'source_path: "objective_selection.selected_completion_criteria.1"',
  'target_path: "objective_context.completion_criterion_2"',
  'source_path: "objective_selection.selected_completion_criteria.2"',
  'target_path: "objective_context.completion_criterion_3"',
  'source_path: "objective_selection.selected_completion_criteria.3"',
  'target_path: "objective_context.completion_criterion_4"',
  'source_path: "objective_selection.selected_completion_criteria.4"',
  'target_path: "objective_context.completion_criterion_5"',
  'source_path: "objective_selection.selected_completion_criteria.5"',
  'target_path: "objective_context.completion_criterion_6"',
]) {
  if (!cycleMissionSource.includes(requiredBindingFragment)) {
    throw new Error(
      `PRODUCT_REPOSITORY_CONTINUATION_AUDIT: completion-criterion binding missing ${requiredBindingFragment}`,
    );
  }
}

const codeAutonomousCapabilityPath =
  "lib/platform/capabilities/createCodeAIAutonomousCapability.js";
requireFragments(codeAutonomousCapabilityPath, [
  "objective_context",
  "repository_head_observed",
  "selection_contract",
  "selected_candidate_id",
  "selection_score",
  "evidence_backed",
  "completion_criterion_1",
  "completion_criterion_6",
  "engineering context only and never permission, approval, commit, deployment or migration authority",
  "additionalProperties: false",
  "objective_context: object(payload.objective_context)",
]);

const codeAutonomousRuntimePath =
  "lib/code/runtime/CodeAIAutonomousRuntime.js";
requireFragments(codeAutonomousRuntimePath, [
  "function normalizedObjectiveContext",
  "function objectiveCompletionCriteria",
  "function validatedCompletionCriteriaEvidence",
  "completion_criterion_1",
  "completion_criterion_6",
  'authority: "CONTEXT_ONLY"',
  'authorization_effect: "NONE"',
  "objective_context: normalizedObjectiveContext(source.objective_context)",
  "objective_context is bounded Product Intelligence provenance and completion-target context only",
  "Every non-empty objective_context.completion_criterion_N is a Product-selected completion target",
  "criteria_evidence",
  "observedOperationIds",
  "CODE_AI_AUTONOMOUS_COMPLETION_CRITERIA_EVIDENCE_REQUIRED",
  "CODE_AI_AUTONOMOUS_COMPLETION_CRITERION_NOT_BOUND",
  "CODE_AI_AUTONOMOUS_COMPLETION_CRITERION_OPERATION_EVIDENCE_REQUIRED",
  "CODE_AI_AUTONOMOUS_COMPLETION_CRITERION_OPERATION_UNKNOWN",
  "CODE_AI_AUTONOMOUS_COMPLETION_CRITERIA_INCOMPLETE",
  'kind: "product_completion_criteria_evidence"',
  "If objective_context.repository_head_observed differs from the workspace base commit",
  "objective_context: normalizedObjectiveContext(state?.objective_context)",
  'product_objective_provenance_authorization_effect: "NONE"',
  "resumeState.objective_context || objectiveContext",
  "objective_context: normalizedObjectiveContext(objectiveContext)",
  "objective_context = null",
  "objective_context || resume_state?.objective_context",
  "objective_context: objectiveContext",
  'kind: "product_objective_provenance"',
]);

const executionStatePath =
  "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js";
requireFragments(executionStatePath, [
  "function productCompletionCriteria",
  "function completionOperationEvidence",
  "function productCompletionCriteriaProjection",
  'item?.kind === "product_completion_criteria_evidence"',
  "observedOperationIds",
  "criteria_evidence: criteriaEvidence",
  "referenced_operations: referencedOperations",
  "referenced_operation_count: referencedOperations.length",
  "product_completion_criteria_required",
  "product_completion_criteria_count",
  "product_completion_criteria_evidence_count",
  "product_completion_criteria_evidence",
  "product_completion_criteria_referenced_operations",
  "product_completion_criteria_referenced_operation_count",
  "product_completion_criteria_verified",
  'product_completion_criteria_authorization_effect: "NONE"',
  "CODE_AI_AUTONOMOUS_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED",
]);

const persistenceDecisionPath =
  "lib/intelligence/runtime/AvantiqoProductPersistenceDecisionRuntime.js";
requireFragments(persistenceDecisionPath, [
  "verifyCompletedCodeAIAutonomousExecution(state)",
  "When Product completion criteria are present, judge durability against the exact verified criteria and their bounded referenced-operation evidence",
  "Do not replace the Product definition of done with a generic completed-status judgment",
  "product_completion_criteria_required",
  "product_completion_criteria",
  "product_completion_criteria_count",
  "product_completion_criteria_evidence_count",
  "product_completion_criteria_verified",
  "product_completion_criteria_evidence",
  "product_completion_criteria_referenced_operations",
  "product_completion_criteria_referenced_operation_count",
  'product_completion_criteria_authorization_effect: "NONE"',
  "completion_criteria_evidence_considered",
  'completion_criteria_authorization_effect: "NONE"',
  "require the persistence rationale to be consistent with the exact criteria and their referenced-operation evidence",
  "generic completion status is not enough",
]);

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

const operatorTurnPath = "lib/operator/runtime/OperatorTurnRuntimeLegacy.js";
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
  "handoff.automatic_execution_started !== false",
  "source: direct.stale_base_replan",
  '"stale_base_current_main_reassessment"',
  '"verified_persistence_handoff"',
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
  "createProductEngineeringCycleCapability",
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

const codeAutonomous = byKey.get("platform.code_ai_autonomous.execute");
const objectiveContextSchema =
  codeAutonomous?.input_schema?.properties?.objective_context;
const codeAutonomousRequired = Array.isArray(codeAutonomous?.input_schema?.required)
  ? codeAutonomous.input_schema.required
  : [];
if (
  !codeAutonomous ||
  !objectiveContextSchema ||
  objectiveContextSchema.type !== "object" ||
  objectiveContextSchema.additionalProperties !== false ||
  codeAutonomousRequired.includes("objective_context") ||
  Number(objectiveContextSchema.properties?.repository_head_observed?.maxLength) !== 160 ||
  Number(objectiveContextSchema.properties?.selection_contract?.maxLength) !== 160 ||
  Number(objectiveContextSchema.properties?.selected_candidate_id?.maxLength) !== 120 ||
  objectiveContextSchema.properties?.selection_score?.type !== "number" ||
  objectiveContextSchema.properties?.evidence_backed?.type !== "boolean"
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: Code AI objective provenance must remain optional bounded non-authoritative context",
  );
}
for (let criterionIndex = 1; criterionIndex <= 6; criterionIndex += 1) {
  const schema = objectiveContextSchema.properties?.[`completion_criterion_${criterionIndex}`];
  if (!schema || schema.type !== "string" || Number(schema.maxLength) !== 700) {
    throw new Error(
      `PRODUCT_REPOSITORY_CONTINUATION_AUDIT: completion criterion ${criterionIndex} must remain a bounded 700-character scalar`,
    );
  }
}
for (const forbiddenAuthorityField of [
  "authorization",
  "permissions",
  "approval",
  "approval_request_id",
  "commit_message",
  "deploy",
  "migration",
]) {
  if (Object.prototype.hasOwnProperty.call(
    objectiveContextSchema.properties || {},
    forbiddenAuthorityField,
  )) {
    throw new Error(
      `PRODUCT_REPOSITORY_CONTINUATION_AUDIT: objective_context must not carry authority field ${forbiddenAuthorityField}`,
    );
  }
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

const productCycle = byKey.get("platform.product_engineering_cycle.execute");
if (
  !productCycle ||
  productCycle.mode !== "write" ||
  productCycle.risk !== "low" ||
  productCycle.auto_execute !== true ||
  productCycle.requires_confirmation === true ||
  productCycle.transactional === true ||
  !productCycle.permissions?.includes("platform.code.ai.execute")
) {
  throw new Error(
    "PRODUCT_REPOSITORY_CONTINUATION_AUDIT: repository-first Product Engineering Cycle must remain a low-risk bounded execute-authority composite",
  );
}

console.log("OPERATOR_PRODUCT_REPOSITORY_CONTINUATION_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_REPOSITORY_EVIDENCE=FRESH_READ_ONLY_GITHUB_MAIN_CHECKOUT");
console.log("OPERATOR_PRODUCT_REPOSITORY_HEAD=OBSERVED_AND_EXPLICIT");
console.log("OPERATOR_PRODUCT_REPOSITORY_CONCURRENCY=NEWER_MAIN_PRESERVED");
console.log("OPERATOR_PRODUCT_REPOSITORY_NEXT_OBJECTIVE=NONEMPTY_BOUNDED_HANDOFF_REQUIRED");
console.log("OPERATOR_PRODUCT_OBJECTIVE_PROVENANCE=HEAD_CONTRACT_CANDIDATE_SCORE_EVIDENCE_FLAG");
console.log("OPERATOR_PRODUCT_OBJECTIVE_PROVENANCE_BINDING=BOUNDED_SCALARS_ONLY");
console.log("OPERATOR_PRODUCT_OBJECTIVE_PROVENANCE_CODE_STATE=PRESERVED_ACROSS_PLANNER_RESUME");
console.log("OPERATOR_PRODUCT_OBJECTIVE_PROVENANCE_AUTHORITY=CONTEXT_ONLY_NONE");
console.log("OPERATOR_PRODUCT_COMPLETION_CRITERIA=MAX_6_EVIDENCE_VERIFIABLE");
console.log("OPERATOR_PRODUCT_COMPLETION_CRITERIA_BINDING=12_SCALAR_SLOT_GOVERNED_HANDOFF");
console.log("OPERATOR_CODE_AI_COMPLETION_CRITERIA=EXACT_BOUND_CRITERIA_PLUS_OBSERVED_OPERATION_EVIDENCE");
console.log("OPERATOR_CODE_AI_COMPLETION_CRITERIA_VERIFICATION=SERVER_OWNED_FAIL_CLOSED");
console.log("OPERATOR_PRODUCT_COMPLETION_CRITERIA_PERSISTENCE_EVIDENCE=CRITERIA_TO_OBSERVED_OPERATIONS");
console.log("OPERATOR_PRODUCT_PERSISTENCE_DECISION=CRITERIA_GROUNDED_NOT_GENERIC_COMPLETION");
console.log("OPERATOR_PRODUCT_COMPLETION_CRITERIA_AUTHORITY=TARGET_ONLY_NONE");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY=REGISTERED_VERIFIER_BOUND_SCALARS_ONLY");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY_CONTEXT=EXACT_DURABLE_MISSION_STEP_ONLY");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY_ATTEMPT_MARKER=REQUIRED");
console.log("OPERATOR_PRODUCT_REPOSITORY_RECOVERY_WRITE_REPLAY=DISABLED");
console.log("OPERATOR_PRODUCT_ALREADY_PERSISTED_CONTINUATION=TWO_READS_ONE_OBJECTIVE_NO_EXECUTION");
console.log("OPERATOR_PRODUCT_CONTINUATION_CONVERSATION=DIRECT_NESTED_OR_MISSION_RESULT_TO_SAFE_RECOMMENDATION");
console.log("OPERATOR_PRODUCT_CONTINUATION_CONVERSATION_AUTO_EXECUTION=DISABLED");
console.log("OPERATOR_PRODUCT_NEXT_CYCLE=FRESH_CURRENT_MAIN_RECHECK_BEFORE_ENGINEERING");
console.log("OPERATOR_PRODUCT_NEXT_CYCLE_OBJECTIVE=REPOSITORY_EVIDENCE_NOT_PROCESS_CATALOG");
console.log("OPERATOR_CODE_AI_COMMIT_STATUS_AUTHORITY=EXECUTE_READ_ONLY_NOT_COMMIT_WRITE");
console.log("OPERATOR_PRODUCT_PERSISTENCE_HANDOFF_AUTHORITY=CONDITIONAL_WRITE_PERMISSION_AT_REGISTERED_STEP");
console.log("OPERATOR_PRODUCT_REPOSITORY_CERTIFICATION=SOURCE_EVIDENCE_ONLY");
console.log("OPERATOR_PRODUCT_AUTONOMY_RECURSION=DISABLED");
