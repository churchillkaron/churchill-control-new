import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Business Partner exposes one shared Code progress feed with four human stages", async () => {
  const panel = await source("components/operator/BusinessPartnerCodeMissionPanel.jsx");
  const rail = await source("components/operator/CodeMissionStageRail.jsx");
  const provider = await source("components/operator/CodeProgressFeedProvider.jsx");

  assert.match(panel, /<CodeProgressFeedProvider organizationId=\{organizationId\}>/);
  assert.match(panel, /<BusinessPartnerCodeActivitySummary organizationId=\{organizationId\} \/>/);
  assert.match(panel, /<CodeMissionStageRail \/>/);
  assert.doesNotMatch(panel, /CodeEngineeringIntelligenceLiveCard|CodeMissionHistoryPanel|BusinessPartnerActiveCodeMissionPanel/);

  for (const label of ["Understand", "Inspect", "Change", "Verify"]) {
    assert.match(rail, new RegExp(`label: "${label}"`));
  }
  assert.match(rail, /Observable work · no private reasoning/);
  assert.doesNotMatch(rail, /Now:/);
  assert.equal((provider.match(/\/api\/operator\/code\/progress/g) || []).length, 1);
});
