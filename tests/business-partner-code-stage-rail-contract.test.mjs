import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = process.cwd();

async function source(path) {
  return readFile(`${ROOT}/${path}`, "utf8");
}

test("Business Partner exposes one shared Code progress feed with four human stages", async () => {
  const page = await source("app/(system)/workspace/[organizationId]/page.jsx");
  const panel = await source("components/operator/BusinessPartnerActiveCodeMissionPanel.jsx");
  const rail = await source("components/operator/CodeMissionStageRail.jsx");
  const provider = await source("components/operator/CodeProgressFeedProvider.jsx");

  assert.match(page, /<CodeProgressFeedProvider organizationId=\{organizationId\}>/);
  assert.match(page, /<BusinessPartnerActiveCodeMissionPanel organizationId=\{organizationId\} \/>/);
  assert.match(panel, /useCodeProgressFeed\(\)/);
  for (const label of ["Understand", "Inspect", "Change", "Verify"]) {
    assert.match(rail, new RegExp(`label: "${label}"`));
  }
  assert.match(rail, /Observable work · no private reasoning/);
  assert.equal((provider.match(/\/api\/operator\/code\/progress/g) || []).length, 1);
});
