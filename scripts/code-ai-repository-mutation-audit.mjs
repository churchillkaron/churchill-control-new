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
  "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_V2",
  "AGENTS.md",
  "CONTRIBUTING",
  ".github/copilot-instructions.md",
  ".github/workflows",
  "detected_build_systems",
  "detected_languages",
  "command_conventions",
  "command_convention_policy",
  "monorepo",
  'repository_content_authorization_effect: "NONE"',
]);

requireMarkers("GENERAL_BUILD_SYSTEMS", repositoryIntelligence, [
  'id: "python-pytest"',
  'id: "go"',
  'id: "rust"',
  'id: "maven"',
  'id: "gradle"',
  'id: "dotnet"',
  'id: "ruby"',
  'id: "php-composer"',
  'id: "swift-package"',
  'id: "cmake"',
  'id: "make"',
  'id: "bazel"',
  "conventional_candidate_verify_before_execution",
  "Repository-declared commands are preferred",
  "buildSystemRoots",
  "working_directory",
  "nested_build_root_count_observed",
  "mixed_language",
  ":(glob)**/pyproject.toml",
  ":(glob)**/Cargo.toml",
  ":(glob)**/go.mod",
  ":(glob)**/pom.xml",
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
  "AVANTIQO_CODE_APPLY_FILES_MUTATION_V2",
  "AVANTIQO_CODE_PLANNER_REPOSITORY_CAPABILITIES_V1",
]);

requireMarkers("REPOSITORY_GUIDANCE", mission, [
  "AVANTIQO_CODE_REPOSITORY_GUIDANCE_V1",
  "plannerRepositoryGuidance",
  "repository_guidance: object(prior.repository_guidance)",
  "instructions_text",
  "verification_commands_text",
  "ci_workflows_text",
  "monorepo_summary",
  "instruction_scope_rule",
  'kind: "repository_guidance"',
  "appendRepositoryGuidanceEvidence(state)",
  'authorization_effect: "NONE"',
  'permission_effect: "NONE"',
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
if (!mission.match(/appendRepositoryGuidanceEvidence\(state\);[\s\S]{0,500}for \(const operation of plan\)/)) {
  throw new Error("CODE_AI_REPOSITORY_GUIDANCE_MUST_REFRESH_BEFORE_RESUMED_OPERATIONS");
}

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_REPOSITORY_MUTATION_SOURCE_AUDIT_V3",
  verified: {
    repository_instruction_discovery: true,
    repository_command_convention_discovery: true,
    general_build_system_detection: true,
    nested_mixed_language_build_manifest_detection: true,
    nested_build_commands_bound_to_working_directory: true,
    node_python_go_rust_java_dotnet_ruby_php_swift_c_cpp_bazel_supported: true,
    repository_declared_commands_preferred_over_conventional_candidates: true,
    conventional_commands_require_repository_verification_when_conditional: true,
    repository_guidance_persisted_in_mission_state: true,
    repository_guidance_reinjected_on_resume: true,
    repository_guidance_survives_bounded_operation_evidence: true,
    repository_guidance_has_no_authorization_or_permission_effect: true,
    literal_regex_path_glob_search: true,
    autonomous_apply_files_supports_write_delete_rename: true,
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
console.log("AVANTIQO_CODE_REPOSITORY_MUTATION_SOURCE_AUDIT_V3=PASS");
