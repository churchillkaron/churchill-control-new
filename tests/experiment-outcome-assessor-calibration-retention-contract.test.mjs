import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoExperimentOutcomeAssessorCalibrationRuntime.js", import.meta.url),
  "utf8",
);

test("outcome assessor calibration excludes expired evidence in the database", () => {
  assert.match(source, /valid_until\.is\.null,valid_until\.gt/);
  assert.match(source, /loadAssessments\(organizationId, nowIso\)/);
});

test("expired outcome assessor calibration evidence is physically bounded", () => {
  assert.match(source, /purgeExpiredOutcomeAssessorCalibrationEvidence/);
  assert.match(source, /OUTCOME_ASSESSMENT_SCOPE, CALIBRATION_EVENT_SCOPE/);
  assert.match(source, /Math\.min\(100, Number\(limit\)/);
  assert.match(source, /\.delete\(\)/);
  assert.match(source, /AVANTIQO_OUTCOME_ASSESSOR_CALIBRATION_PURGE_FAILED/);
});
