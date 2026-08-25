import { readFile } from "node:fs/promises";

const paths = [
  "lib/code/runtime/CodeProductCompletionCriteriaRuntime.js",
  "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js",
  "lib/code/runtime/CodeMissionAttestationRuntime.js",
  "lib/code/runtime/CodeGitHubCommitRuntime.js",
];

const files = Object.fromEntries(
  await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])),
);

function requireFragments(path, fragments) {
  const source = files[path];
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(`PRODUCT_GITHUB_COMPLETION_CRITERIA_AUDIT:${path} missing ${fragment}`);
    }
  }
}

const criteriaPath = "lib/code/runtime/CodeProductCompletionCriteriaRuntime.js";
requireFragments(criteriaPath, [
  "AVANTIQO_CODE_PRODUCT_COMPLETION_CRITERIA_V1",
  "codeProductCompletionCriteria",
  "projectCodeProductCompletionCriteria",
  "assertCodeProductCompletionCriteriaVerified",
  "completion_criterion_1",
  "completion_criterion_6",
  'item?.kind === "product_completion_criteria_evidence"',
  "observedOperationIds",
  "criteria_evidence: criteriaEvidence",
  "referenced_operations: referencedOperations",
  "referenced_operation_count: referencedOperations.length",
  'authorization_effect: "NONE"',
]);

const statePath = "lib/code/runtime/CodeAIAutonomousExecutionStateRuntime.js";
requireFragments(statePath, [
  "projectCodeProductCompletionCriteria",
  "assertCodeProductCompletionCriteriaVerified",
  "const completionCriteria = projectCodeProductCompletionCriteria(state)",
  "product_completion_criteria_contract",
  "product_completion_criteria_required",
  "product_completion_criteria_count",
  "product_completion_criteria_evidence_count",
  "product_completion_criteria_evidence",
  "product_completion_criteria_referenced_operations",
  "product_completion_criteria_referenced_operation_count",
  "product_completion_criteria_verified",
  "completionCriteria.authorization_effect",
  "verifyCompletedCodeAIAutonomousMissionState",
  "CODE_AI_AUTONOMOUS_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED",
]);

const attestationPath = "lib/code/runtime/CodeMissionAttestationRuntime.js";
requireFragments(attestationPath, [
  'filter((key) => key !== "attestation")',
  "JSON.stringify(canonical(object(state)))",
  'createHmac("sha256", secret)',
  "timingSafeEqual",
]);

const githubPath = "lib/code/runtime/CodeGitHubCommitRuntime.js";
requireFragments(githubPath, [
  "assertCodeProductCompletionCriteriaVerified",
  "CODE_AI_GITHUB_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED",
  "function assertMissionReady",
  "recoverVerifiedCodeMissionCommit",
  "commitVerifiedCodeMission",
  "assertMissionReady(state, repository)",
  "connectGitHubToken",
  "CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED",
  "CODE_AI_GITHUB_POST_COMMIT_VERIFICATION_FAILED",
  "force: false",
]);

const githubSource = files[githubPath];
const recoverySource = githubSource.slice(
  githubSource.indexOf("export async function recoverVerifiedCodeMissionCommit"),
  githubSource.indexOf("export async function commitVerifiedCodeMission"),
);
const commitSource = githubSource.slice(
  githubSource.indexOf("export async function commitVerifiedCodeMission"),
  githubSource.indexOf("export const CodeGitHubCommitRuntime"),
);
for (const [name, source] of [
  ["recovery", recoverySource],
  ["commit", commitSource],
]) {
  const readyIndex = source.indexOf("assertMissionReady(state, repository);");
  const tokenIndex = source.indexOf("const token = await connectGitHubToken");
  if (!source || readyIndex < 0 || tokenIndex < 0 || readyIndex > tokenIndex) {
    throw new Error(
      `PRODUCT_GITHUB_COMPLETION_CRITERIA_AUDIT:${name} must reverify Product criteria before GitHub token acquisition`,
    );
  }
}

const assertMissionReadySource = githubSource.slice(
  githubSource.indexOf("function assertMissionReady"),
  githubSource.indexOf("async function jsonResponse"),
);
if (
  !assertMissionReadySource.includes("assertCodeProductCompletionCriteriaVerified(") ||
  !assertMissionReadySource.includes("CODE_AI_GITHUB_PRODUCT_COMPLETION_CRITERIA_NOT_VERIFIED")
) {
  throw new Error(
    "PRODUCT_GITHUB_COMPLETION_CRITERIA_AUDIT: final GitHub readiness must fail closed on Product completion criteria",
  );
}

console.log("OPERATOR_PRODUCT_GITHUB_COMPLETION_CRITERIA_AUDIT=PASS");
console.log("OPERATOR_PRODUCT_COMPLETION_CRITERIA_VERIFIER=CANONICAL_SHARED_CODE_RUNTIME");
console.log("OPERATOR_CODE_AI_COMMIT_ARTIFACT=FULL_STATE_ATTESTATION_BINDS_CRITERIA_PATCH_BASE");
console.log("OPERATOR_CODE_AI_GITHUB_COMPLETION_CRITERIA=REVERIFIED_BEFORE_GITHUB_ACCESS");
console.log("OPERATOR_CODE_AI_GITHUB_RECOVERY_COMPLETION_CRITERIA=REVERIFIED_BEFORE_RECOVERY_ACCESS");
console.log("OPERATOR_PRODUCT_COMPLETION_CRITERIA_FINAL_AUTHORITY=TARGET_ONLY_NONE");
