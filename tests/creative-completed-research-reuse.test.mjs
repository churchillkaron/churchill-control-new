import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/research/runtime/ResearchRuntime.js", "utf8");

test("completed research identity never falls back to creative project title", () => {
  const start = source.indexOf("function namedCompany");
  const end = source.indexOf("function validCompletedResearchReport", start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /project\.name/);
  assert.doesNotMatch(block, /project\.title/);
});

test("completed paid research can recover a valid report through settled usage lineage", () => {
  assert.match(source, /const settledUsageId = plainText\(approval\.structured_usage_id\)/);
  assert.match(source, /item\?\.metadata\?\.structured_usage_id/);
  assert.match(source, /validCompletedResearchReport/);
});

test("completed report reuse does not require an unexpired approval", () => {
  const start = source.indexOf("function completedPaidResearchReport");
  const end = source.indexOf("function researchForDirection", start);
  const block = source.slice(start, end);
  assert.doesNotMatch(block, /expires_at/);
  assert.match(block, /COMPLETED_PAID_RESEARCH_STATUSES/);
});
