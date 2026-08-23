import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://audit.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "audit-service-role-key";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const paths = [
  "lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js",
  "lib/intelligence/runtime/AvantiqoProductAutonomyAssessmentRuntime.js",
  "lib/platform/capabilities/createProductRepositoryAssessmentCapability.js",
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
  "lib/platform/capabilities/createProductPersistenceHandoffCapability.js",
  [
    'source_step_id: "commit_verified_changes"',
    'source: "verification"',
    'source_path: "commit.commit_sha"',
    'target_path: "verified_commit_sha"',
    'source_path: "verification_source"',
    'target_path: "verified_commit_verification_source"',
    'source_path: "server_state_found"',
    'target_path: "verified_commit_server_state_found"',
    "verified_commit_evidence_bound_to_continuation: true",
    "write_replay_for_verification_recovery_allowed: false",
  ],
);

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
    "actual checked-out current main",
    "Repository checkout evidence is source evidence, not build, test, end-to-end, provider, deployment or certification evidence.",
  ],
);

requireFragments("lib/platform/runtime/PlatformDomainRuntime.js", [
  "createProductRepositoryAssessmentCapability",
  "product_repository_assessment",
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
console.log("OPERATOR_PRODUCT_REPOSITORY_CERTIFICATION=SOURCE_EVIDENCE_ONLY");
console.log("OPERATOR_PRODUCT_AUTONOMY_RECURSION=DISABLED");
