import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  assessProductPortfolioProgressIntegrity,
  assertProductPortfolioProgressIntegrity,
} from "../lib/code/runtime/CodeAIProductPortfolioProgressIntegrityRuntime.js";

test("verified persistence must advance beyond the engineering base commit", () => {
  const result = assessProductPortfolioProgressIntegrity({
    node: { base_commit: "abc123" },
    verified_commit_sha: "abc123",
  });
  assert.equal(result.verified, false);
  assert.ok(result.blockers.includes("PRODUCT_ENGINEERING_PORTFOLIO_ZERO_REPOSITORY_PROGRESS"));
  assert.throws(
    () => assertProductPortfolioProgressIntegrity({
      node: { base_commit: "abc123" },
      verified_commit_sha: "abc123",
    }),
    /PRODUCT_ENGINEERING_PORTFOLIO_ZERO_REPOSITORY_PROGRESS/,
  );
});

test("a previously retired portfolio commit cannot be counted twice", () => {
  const result = assessProductPortfolioProgressIntegrity({
    node: { base_commit: "base-new" },
    completed_objectives: [{ verified_commit_sha: "done456" }],
    verified_commit_sha: "done456",
  });
  assert.equal(result.verified, false);
  assert.ok(result.blockers.includes("PRODUCT_ENGINEERING_PORTFOLIO_DUPLICATE_VERIFIED_COMMIT"));
});

test("a new verified commit is accepted as genuine portfolio progress", () => {
  const result = assertProductPortfolioProgressIntegrity({
    node: { base_commit: "base123" },
    completed_objectives: [{ verified_commit_sha: "older111" }],
    verified_commit_sha: "new789",
  });
  assert.equal(result.verified, true);
  assert.equal(result.repository_head_advanced_from_engineering_base, true);
  assert.equal(result.prior_verified_commit_reused, false);
});

test("the real portfolio retirement boundary enforces progress integrity", async () => {
  const runtime = await readFile(
    "lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioRuntime.js",
    "utf8",
  );
  assert.match(runtime, /assertProductPortfolioProgressIntegrity/);
  assert.match(runtime, /progress_integrity_verified/);
  assert.match(runtime, /completePortfolioNodeAfterVerifiedPersistence/);
});
