import { readFile } from "node:fs/promises";

const path = "lib/platform/capabilities/createCodeAICommitCapability.js";
const source = await readFile(path, "utf8");

function requireFragments(fragments) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(`CODE_AI_COMMIT_POST_WRITE_SAFETY_AUDIT:${path} missing ${fragment}`);
    }
  }
}

requireFragments([
  "commitVerifiedCodeMission",
  "persistVerifiedCommitState",
  "retireVerifiedCommitArtifact",
  "CODE_AI_COMMIT_POST_WRITE_STATE_PERSIST_FAILED",
  "CODE_AI_COMMIT_POST_WRITE_ARTIFACT_RETIRE_FAILED",
  'status: "VERIFIED_COMMIT_STATE_PERSIST_FAILED"',
  'status: "VERIFIED_COMMIT_ARTIFACT_RETIRE_FAILED"',
  'status: "VERIFIED_COMMIT_ARTIFACT_RETAINED_FOR_RECOVERY"',
  "commitState.persisted",
  "VERIFIED_COMMIT_STATE_PERSIST_INCOMPLETE",
  "VERIFIED_COMMIT_ARTIFACT_RETIRE_INCOMPLETE",
  "VERIFIED_COMMIT_HOUSEKEEPING_COMPLETE",
  "github_write_verified: result?.verified === true",
  "safe_to_retry_commit: false",
  "verification_read_required: true",
]);

const writeIndex = source.indexOf("const result = await commitVerifiedCodeMission");
const stateIndex = source.indexOf("const commitState = await persistVerifiedCommitState");
if (writeIndex < 0 || stateIndex <= writeIndex) {
  throw new Error(
    "CODE_AI_COMMIT_POST_WRITE_SAFETY_AUDIT: server state handling must happen only after the verified GitHub write runtime returns",
  );
}

const postWriteSource = source.slice(stateIndex);
if (/throw\s+new\s+Error/.test(postWriteSource)) {
  throw new Error(
    "CODE_AI_COMMIT_POST_WRITE_SAFETY_AUDIT: verified-write housekeeping must not throw a new generic error after GitHub persistence",
  );
}

if (!source.includes("const artifact = commitState.persisted")) {
  throw new Error(
    "CODE_AI_COMMIT_POST_WRITE_SAFETY_AUDIT: source artifact retirement must be conditional on commit-state persistence",
  );
}

console.log("CODE_AI_COMMIT_POST_WRITE_SAFETY_AUDIT=PASS");
console.log("CODE_AI_VERIFIED_GITHUB_WRITE=NEVER_REPORTED_AS_GENERIC_RETRYABLE_FAILURE");
console.log("CODE_AI_COMMIT_STATE_FAILURE=EXPLICIT_AND_ARTIFACT_RETAINED");
console.log("CODE_AI_ARTIFACT_RETIRE_FAILURE=NON_FATAL_AFTER_STATE_PERSISTENCE");
console.log("CODE_AI_COMMIT_RETRY_AFTER_VERIFIED_WRITE=FALSE");
