import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/validation/CreativeMasterPlanValidator.js", "utf8");

test("60s premium patient+tension source contract resolves to at least 24 authored shots", () => {
  const patientMatch = source.match(/premiumTemporal && patient\) authoredCoverageAverageSeconds = ([0-9.]+)/);
  const tensionMatch = source.match(/premiumTemporal && tensionDriven\) authoredCoverageAverageSeconds = Math\.min\(authoredCoverageAverageSeconds, ([0-9.]+)\)/);
  assert.ok(patientMatch, "premium patient cadence constant missing");
  assert.ok(tensionMatch, "premium tension cadence constant missing");
  const patient = Number(patientMatch[1]);
  const tension = Number(tensionMatch[1]);
  const authoredAverage = Math.min(patient, tension);
  assert.equal(authoredAverage, 2.5);
  assert.equal(Math.ceil(60 / authoredAverage), 24);
  assert.match(source, /const minimumShotCount = Math\.max\(technicalMinimumShotCount, authoredCoverageFloorCount\)/);
  assert.match(source, /premium_temporal: premiumTemporal/);
});
