import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("home keeps intelligence admin panels out of Business Partner", async () => {
  const home = await source("app/(system)/workspace/[organizationId]/page.jsx");
  assert.doesNotMatch(home, /SyntheticIntelligenceControlCenter/);
  assert.doesNotMatch(home, /SyntheticIntelligenceForecastTrackRecord/);
  assert.doesNotMatch(home, /SyntheticIntelligenceDeliveryControl/);
  assert.match(home, /<AutonomousWatchAlertBridge organizationId=\{organizationId\} \/>/);
});

test("Business Partner Code activity is human-readable rather than engineering telemetry", async () => {
  const summary = await source("components/operator/BusinessPartnerCodeActivitySummary.jsx");
  assert.match(summary, /I am checking the relevant workflow and evidence/);
  assert.match(summary, /I found the area that needs attention/);
  assert.match(summary, /I am checking the workflow now/);
  assert.match(summary, /View in Code Studio/);
  assert.doesNotMatch(summary, /latest_test_command|completed_operation_count|progress\.ref|FileCode2|GitBranch/);
});
