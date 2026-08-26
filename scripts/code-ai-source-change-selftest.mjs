import {
  codeAIChangedPathsFromDiff,
  normalizeCodeAISourceChanges,
} from "../lib/code/runtime/CodeAISourceChangePolicy.js";
import { assessCodeAIWorldClassQuality } from "../lib/code/runtime/CodeAIWorldClassQualityPolicy.js";

const CONTRACT = "AVANTIQO_CODE_AI_SOURCE_CHANGE_SELFTEST_V1";

function assert(condition, code, evidence = null) {
  if (!condition) throw new Error(`${code}:${JSON.stringify(evidence)}`);
}

function operation(id, action, index) {
  return {
    at: new Date(1_700_000_000_000 + index * 1000).toISOString(),
    kind: "operation",
    operation_id: id,
    action,
    status: "completed",
  };
}

const legacy = normalizeCodeAISourceChanges([
  { path: "src/example.js", content: "export const value = 1;\n" },
]);
assert(legacy[0]?.operation === "write", "LEGACY_WRITE_DEFAULT_REQUIRED", legacy);
assert(legacy[0]?.content === "export const value = 1;\n", "LEGACY_WRITE_CONTENT_REQUIRED", legacy);

const deletion = normalizeCodeAISourceChanges([
  { path: "src/obsolete.js", operation: "delete", content: "must disappear" },
]);
assert(deletion[0]?.operation === "delete", "DELETE_OPERATION_REQUIRED", deletion);
assert(deletion[0]?.content === null, "DELETE_CONTENT_MUST_BE_NULL", deletion);

const renamePaths = codeAIChangedPathsFromDiff({
  status: [" R src/old-name.js -> src/new-name.js"],
});
assert(renamePaths.includes("src/old-name.js"), "RENAME_OLD_PATH_REQUIRED", renamePaths);
assert(renamePaths.includes("src/new-name.js"), "RENAME_NEW_PATH_REQUIRED", renamePaths);

const deleteQualityState = {
  contract: "AVANTIQO_CODE_AI_MISSION_V1",
  status: "completed",
  files_changed: ["src/obsolete.js"],
  source_changes: [{ path: "src/obsolete.js", operation: "delete", content: null }],
  patch: "diff --git a/src/obsolete.js b/src/obsolete.js\ndeleted file mode 100644\n",
  evidence: [
    operation("verify-old", "verify", 0),
    operation("delete", "delete_files", 1),
    operation("review", "diff", 2),
  ],
  verification: [{ operation_id: "verify-old", passed: true }],
  tests: [{ operation_id: "verify-old", command: "npm", args: ["test"], exit_code: 0 }],
};
const staleDelete = assessCodeAIWorldClassQuality(deleteQualityState);
assert(staleDelete.verified === false, "DELETE_MUST_INVALIDATE_OLD_VERIFICATION", staleDelete);
assert(
  staleDelete.blockers.some((item) => item.startsWith("CODE_AI_WORLDCLASS_FRESH_VERIFICATION_GATES_REQUIRED")),
  "DELETE_FRESH_VERIFICATION_BLOCKER_REQUIRED",
  staleDelete,
);

const freshDelete = assessCodeAIWorldClassQuality({
  ...deleteQualityState,
  evidence: [
    operation("delete", "delete_files", 0),
    operation("verify-new", "verify", 1),
    operation("review", "diff", 2),
  ],
  verification: [{ operation_id: "verify-new", passed: true }],
  tests: [{ operation_id: "verify-new", command: "npm", args: ["test"], exit_code: 0 }],
});
assert(freshDelete.verified === true, "DELETE_WITH_FRESH_VERIFICATION_SHOULD_PASS", freshDelete);

const renameQuality = assessCodeAIWorldClassQuality({
  contract: "AVANTIQO_CODE_AI_MISSION_V1",
  status: "completed",
  files_changed: ["src/old-name.js", "src/new-name.js"],
  source_changes: [
    { path: "src/old-name.js", operation: "delete", content: null },
    { path: "src/new-name.js", operation: "write", content: "export const value = 1;\n" },
  ],
  patch: "diff --git a/src/old-name.js b/src/new-name.js\nsimilarity index 100%\n",
  evidence: [
    operation("rename", "rename_files", 0),
    operation("verify", "verify", 1),
    operation("review", "diff", 2),
  ],
  verification: [{ operation_id: "verify", passed: true }],
  tests: [{ operation_id: "verify", command: "node", args: ["--check", "src/new-name.js"], exit_code: 0 }],
});
assert(renameQuality.verified === true, "RENAME_WITH_FRESH_VERIFICATION_SHOULD_PASS", renameQuality);
assert(renameQuality.changed_file_count === 2, "RENAME_MUST_COUNT_BOTH_PATHS", renameQuality);
assert(renameQuality.source_manifest_matches_workspace === true, "RENAME_MANIFEST_MUST_MATCH", renameQuality);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  cases: {
    legacy_source_changes_default_to_write: true,
    delete_is_first_class_not_empty_write: true,
    rename_status_preserves_old_and_new_paths: true,
    delete_invalidates_stale_verification: true,
    delete_with_fresh_verification_passes: true,
    rename_counts_both_paths_and_passes_with_fresh_verification: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
