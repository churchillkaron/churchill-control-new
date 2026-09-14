import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime.js", import.meta.url),
  "utf8",
);

test("canary active reads exclude expired rows in Supabase", () => {
  assert.match(source, /loadActiveRows\([\s\S]*valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
  assert.match(source, /loadCurrentSelections\([\s\S]*valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
  assert.match(source, /loadCurrentSnapshot\([\s\S]*valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
  assert.match(source, /loadEvaluationByCycle\([\s\S]*valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
  assert.match(source, /loadRollbackDirective\([\s\S]*valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
});

test("canary governance evidence is not physically purged", () => {
  assert.match(source, /selection_policy_canary_application/);
  assert.match(source, /selection_policy_canary_rollback_enforcement/);
  assert.doesNotMatch(source, /purgeExpiredCanary/);
});
