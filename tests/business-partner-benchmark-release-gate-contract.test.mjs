import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const releaseSafety = fs.readFileSync(".github/workflows/avantiqo-release-safety.yml", "utf8");
const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const runtime = fs.readFileSync(
  "lib/intelligence/runtime/AvantiqoBusinessPartnerBenchmarkFloorRuntime.mjs",
  "utf8",
);

test("release-safety cannot bypass the Business Partner competitive benchmark floor", () => {
  assert.match(releaseSafety, /Business Partner competitive quality floor/);
  assert.match(releaseSafety, /business-partner-benchmark-floor\.test\.mjs/);
  assert.match(releaseSafety, /certify:business-partner:benchmark-floor:policy/);
});

test("CI certifies the Business Partner floor independently of the repository regression suite", () => {
  const floorJob = ci.indexOf("business-partner-benchmark-floor:");
  const validateJob = ci.indexOf("validate:");
  assert.ok(floorJob >= 0);
  assert.ok(validateJob > floorJob);
  assert.match(ci, /Business Partner benchmark floor certification/);
});

test("the floor remains strongest-reference per dimension and fail closed", () => {
  assert.match(runtime, /Math\.max/);
  assert.match(runtime, /DIMENSION_BELOW_REFERENCE_FLOOR/);
  assert.match(runtime, /MISSING_REFERENCE_EVIDENCE/);
  assert.match(runtime, /REFERENCE_EVIDENCE_NOT_FRESH/);
  assert.match(runtime, /BENCHMARK_CONDITIONS_NOT_MATCHED/);
  assert.match(runtime, /regression_policy:\s*"BLOCK_RELEASE"/);
});
