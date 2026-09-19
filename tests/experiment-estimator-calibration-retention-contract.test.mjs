import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  path.join(here, "../lib/intelligence/runtime/AvantiqoExperimentEstimatorCalibrationRuntime.js"),
  "utf8",
);

test("calibration reads exclude expired evidence in the database", () => {
  assert.match(source, /valid_until\.is\.null,valid_until\.gt\.\$\{nowIso\}/);
  assert.match(source, /\.eq\("memory_scope", ESTIMATE_SCOPE\)[\s\S]*?\.eq\("active", true\)/);
  assert.match(source, /\.eq\("memory_scope", RECEIPT_SCOPE\)[\s\S]*?\.or\(`/);
  assert.match(source, /\.eq\("memory_scope", OUTCOME_ASSESSMENT_SCOPE\)[\s\S]*?\.or\(`/);
});

test("expired assessment and calibration evidence is physically bounded", () => {
  assert.match(source, /purgeExpiredEstimatorCalibrationEvidence/);
  assert.match(source, /OUTCOME_ASSESSMENT_SCOPE, CALIBRATION_EVENT_SCOPE/);
  assert.match(source, /\.lt\("valid_until", new Date\(\)\.toISOString\(\)\)/);
  assert.match(source, /Math\.min\(100, Number\(limit\) \|\| 100\)/);
  assert.match(source, /\.delete\(\)/);
  assert.match(source, /AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_PURGE_FAILED/);
});