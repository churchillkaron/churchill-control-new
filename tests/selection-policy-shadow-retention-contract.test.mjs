import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime.js", import.meta.url),
  "utf8",
);

test("shadow policy reads exclude expired active evidence", () => {
  assert.match(source, /loadState\(organizationId, nowIso/);
  assert.match(source, /valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
  assert.match(source, /SHADOW_SNAPSHOT_SCOPE/);
  assert.match(source, /SHADOW_EVALUATION_SCOPE/);
});

test("expired shadow snapshot and evaluation evidence is physically bounded", () => {
  assert.match(source, /purgeExpiredShadowEvidence/);
  assert.match(source, /selection_policy_shadow_challenger_snapshot/);
  assert.match(source, /selection_policy_shadow_challenger_evaluation/);
  assert.match(source, /Math\.min\(100/);
  assert.match(source, /\.delete\(\)/);
  assert.match(source, /expired_shadow_evidence_purged/);
});
