import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const github = await readFile(new URL("../lib/code/runtime/CodeGitHubCommitRuntime.js", import.meta.url), "utf8");
const commit = await readFile(new URL("../lib/platform/capabilities/createCodeAICommitCapability.js", import.meta.url), "utf8");
const commitState = await readFile(new URL("../lib/code/runtime/CodeAICommitExecutionStateRuntime.js", import.meta.url), "utf8");
const rolling = await readFile(new URL("../lib/platform/capabilities/createCodeAIRollingReleaseCapability.js", import.meta.url), "utf8");
const production = await readFile(new URL("../lib/platform/capabilities/createProductProductionReleaseCapability.js", import.meta.url), "utf8");

test("certified review commit is promoted to main without creating another commit", () => {
  assert.match(github, /promoteVerifiedCodeMissionReviewCommit/);
  assert.match(github, /CODE_AI_GITHUB_VERIFIED_REVIEW_COMMIT_REQUIRED/);
  assert.match(github, /CODE_AI_GITHUB_REVIEW_BRANCH_COMMIT_MOVED/);
  assert.match(github, /body: \{ sha: reviewSha, force: false \}/);
  assert.match(github, /new_commit_created: false/);
  assert.match(commit, /missionState\?\.review_delivery\?\.verified === true/);
  assert.match(commit, /promoteVerifiedCodeMissionReviewCommit/);
});

test("durable verified commit state retains only bounded release identity after source artifact retirement", () => {
  assert.match(commitState, /release_certified: releaseCertification\.verified === true/);
  assert.match(commitState, /certified_review_commit_sha/);
  assert.match(commitState, /preview_deployment_id/);
  assert.match(commitState, /CODE_AI_COMMIT_STATE_CERTIFIED_COMMIT_MISMATCH/);
  assert.match(commitState, /CODE_AI_COMMIT_STATE_REVIEW_COMMIT_MISMATCH/);
});

test("rolling release uses durable verified commit state rather than retired source artifact", () => {
  assert.match(rolling, /loadCodeAICommitExecutionState/);
  assert.doesNotMatch(rolling, /loadCodeAICommitArtifact/);
  assert.match(rolling, /release\.release_certified !== true/);
  assert.match(rolling, /CODE_AI_ROLLING_RELEASE_COMMIT_STATE_MISMATCH/);
  assert.match(rolling, /CODE_AI_ROLLING_RELEASE_CERTIFIED_COMMIT_MISMATCH/);
});

test("safe Vercel rolling policy is verified before main commit is invoked", () => {
  const gate = production.indexOf("const rollingReleasePolicy = await verifyVercelRollingReleasePolicy()");
  const commitCall = production.indexOf("const committed = await executeUbteCapability");
  assert.ok(gate >= 0 && commitCall >= 0 && gate < commitCall);
});
