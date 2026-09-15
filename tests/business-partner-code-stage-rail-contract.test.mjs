import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Business Partner remains the Code control plane without a duplicate mission panel", async () => {
  const panel = await source("components/operator/BusinessPartnerCodeMissionPanel.jsx");
  const codePage = await source("app/(system)/workspace/[organizationId]/creative/code/page.jsx");
  const policy = await source("lib/operator/runtime/OperatorSelfEngineeringPolicy.js");
  const rail = await source("components/operator/CodeMissionStageRail.jsx");
  const provider = await source("components/operator/CodeProgressFeedProvider.jsx");

  assert.match(panel, /return null/);
  assert.doesNotMatch(panel, /CodeProgressFeedProvider|CodeMissionStageRail|BusinessPartnerActiveCodeMissionPanel/);
  assert.match(policy, /Business Partner as the control plane/);
  assert.match(policy, /Code Studio is an optional/);
  assert.match(codePage, /<CodeProgressFeedProvider organizationId=\{organizationId\}>/);
  for (const label of ["Understand", "Inspect", "Change", "Verify"]) {
    assert.match(rail, new RegExp(`label: "${label}"`));
  }
  assert.match(rail, /Observable work · no private reasoning/);
  assert.equal((provider.match(/\/api\/operator\/code\/progress/g) || []).length, 1);
});
