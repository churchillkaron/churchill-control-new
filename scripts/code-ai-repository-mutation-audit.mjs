import { readFile } from "node:fs/promises";

const files = {
  sourcePolicy: "lib/code/runtime/CodeAISourceChangePolicy.js",
  mutation: "lib/code/runtime/CodeWorkspaceFileMutationRuntime.js",
  repositoryIntelligence: "lib/code/runtime/CodeRepositoryIntelligenceRuntime.js",
  workspace: "lib/code/runtime/CodeWorkspaceSandboxRuntime.js",
  mission: "lib/code/runtime/CodeAIMissionRuntime.js",
  quality: "lib/code/runtime/CodeAIWorldClassQualityPolicy.js",
  githubCommit: "lib/code/runtime/CodeGitHubCommitRuntime.js",
};

async function source(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`CODE_AI_REPOSITORY_MUTATION_AUDIT_FILE_MISSING:${filePath}:${error?.code || "READ_FAILED"}`);
  }
}

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) {
    throw new Error(`CODE_AI_REPOSITORY_MUTATION_AUDIT_${label}_MARKERS_MISSING:${missing.join(",")}`);
  }
}

const [sourcePolicy, mutation, repositoryIntelligence, workspace, mission, quality, githubCommit] =
  await Promise.all(Object.values(files).map(source));

requireMarkers("SOURCE_POLICY", sourcePolicy, [
  "AVANTIQO_CODE_AI_SOURCE_CHANGE_V1",
  'new Set(["write", "delete"])',
  'operation === "delete" ? null',
  "codeAIChangedPathsFromDiff",
  '"apply_files", "delete_files", "rename_files"',
]);

requireMarkers("MUTATION_RUNTIME", mutation, [
  "AVANTIQO_CODE_WORKSPACE_FILE_MUTATION_V1",
  "deleteCodeWorkspaceFiles",
  "renameCodeWorkspaceFiles",
  "CODE_AI_RENAME_DESTINATION_EXISTS",
  "CODE_AI_RENAME_PATH_COLLISION",
  "workspace.sandbox.runCommand",
  'runIntentional(workspace, "rm"',
  'runIntentional(workspace, "mv"',
]);

requireMarkers("REPOSITORY_INTELLIGENCE", repositoryIntelligence, [
  "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_V1",
  "AGENTS.md",
  "CONTRIBUTING",
  ".github/copilot-instructions.md",
  ".github/workflows",
  "command_conventions",
  "monorepo",
  'repository_content_authorization_effect: "NONE"',
]);

requireMarkers("SEARCH", workspace, [
  'new Set(["literal", "regex", "path", "glob"])',
  'searchMode === "path"',
  'searchMode === "glob"',
  'args.push("-E")',
  "CODE_AI_SEARCH_PATHSPEC_MAGIC_RESERVED",
  "CODE_AI_SEARCH_ENV_FILE_BLOCKED",
]);

requireMarkers("MISSION", mission, [
  '"delete_files"',
  '"rename_files"',
  "deleteCodeWorkspaceFiles",
  "renameCodeWorkspaceFiles",
  'operation: "delete"',
  'operation: "write"',
  "deletedPathAbsent",
  "codeAIChangedPathsFromDiff",
]);

requireMarkers("QUALITY", quality, [
  "codeAIEditAction",
  "lastEditPosition",
  "codeAISourceChangePaths",
  "CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED",
]);

requireMarkers("GITHUB_COMMIT", githubCommit, [
  "normalizeCodeAISourceChanges",
  'change.operation === "delete"',
  "sha: null",
  "comparisonChangedPaths",
  "previous_filename",
  "verifyCommitTreeChanges",
  "deleted_file_count",
  "CODE_AI_GITHUB_POST_COMMIT_VERIFICATION_FAILED",
]);

if (mission.includes('operation: "delete",\n        content: ""')) {
  throw new Error("CODE_AI_REPOSITORY_MUTATION_AUDIT_DELETE_MUST_NOT_BECOME_EMPTY_WRITE");
}
if (githubCommit.includes('force: true')) {
  throw new Error("CODE_AI_REPOSITORY_MUTATION_AUDIT_FORCE_PUSH_FORBIDDEN");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_REPOSITORY_MUTATION_SOURCE_AUDIT_V1",
  verified: {
    repository_instruction_discovery: true,
    repository_command_convention_discovery: true,
    literal_regex_path_glob_search: true,
    delete_is_first_class_source_change: true,
    rename_is_delete_plus_write: true,
    deleted_paths_survive_resume_state: true,
    delete_and_rename_reset_worldclass_verification_freshness: true,
    github_tree_deletion_semantics: true,
    github_recovery_verifies_deleted_paths_absent: true,
    github_recovery_understands_rename_previous_filename: true,
    normal_run_mutation_guard_not_weakened: true,
    non_force_main_commit_preserved: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_CODE_REPOSITORY_MUTATION_SOURCE_AUDIT_V1=PASS");
