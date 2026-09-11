import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  assessProductPortfolioProgressIntegrity,
} from "../lib/code/runtime/CodeAIProductPortfolioProgressIntegrityRuntime.js";

test("different commit is not portfolio progress without repository ancestry proof", () => {
  const result = assessProductPortfolioProgressIntegrity({
    node: { base_commit: "a".repeat(40) },
    verified_commit_sha: "b".repeat(40),
  });
  assert.equal(result.verified, false);
  assert.equal(result.repository_head_advanced_from_engineering_base, false);
  assert.ok(result.blockers.includes("PRODUCT_ENGINEERING_PORTFOLIO_REPOSITORY_ANCESTRY_REQUIRED"));
});

test("server-verified descendant commit can count as repository progress", () => {
  const result = assessProductPortfolioProgressIntegrity({
    node: { base_commit: "a".repeat(40) },
    verified_commit_sha: "b".repeat(40),
    repository_ancestry_verified: true,
  });
  assert.equal(result.verified, true);
  assert.equal(result.repository_ancestry_verified, true);
  assert.equal(result.repository_head_advanced_from_engineering_base, true);
});

test("portfolio persistence boundary proves ancestry with read-only git before retirement", () => {
  const source = fs.readFileSync(
    "lib/platform/capabilities/createProductEngineeringPortfolioCapability.js",
    "utf8",
  );
  assert.match(source, /CodeWorkspaceRuntime\.open/);
  assert.match(source, /"merge-base", "--is-ancestor"/);
  assert.match(source, /repositoryAncestryVerified: true/);
  assert.match(source, /PRODUCT_ENGINEERING_PORTFOLIO_COMMIT_NOT_DESCENDANT/);
  assert.match(source, /automaticCommitAllowed: false/);
  assert.match(source, /productionDeploymentAllowed: false/);
});
