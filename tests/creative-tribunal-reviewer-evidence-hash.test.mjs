import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("Tribunal defines conservative reviewer-specific evidence scopes", () => {
  assert.match(source, /return "ASSET_CONTINUITY"/);
  assert.match(source, /return "BRAND_TRUTH"/);
  assert.match(source, /return "NARRATIVE"/);
  assert.match(source, /return "FULL_PLAN"/);
  assert.match(source, /default:\s*return canonical/);
});

test("review evidence hash binds reviewer mandate floor context and scoped evidence", () => {
  assert.match(source, /function reviewerEvidenceHash/);
  assert.match(source, /required_release_floor: floor/);
  assert.match(source, /context,/);
  assert.match(source, /evidence: reviewerPlanEvidence\(reviewer, plan\)/);
});

test("review rows persist scoped evidence hashes for future reuse", () => {
  assert.match(source, /review_evidence_hash: evidenceHash/);
  assert.match(source, /reviewEvidenceHash\(\{/);
});

test("legacy whole-plan settled review reuse remains supported", () => {
  assert.match(source, /legacySettledReviewsVerified/);
  assert.match(source, /!text\(settled\.review_evidence_hash\) && legacy_settled_reviews_verified === true/);
  assert.match(source, /CREATIVE_TRIBUNAL_SETTLED_REVIEW_PLAN_MISMATCH/);
});
