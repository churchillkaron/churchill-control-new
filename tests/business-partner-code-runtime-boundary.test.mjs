import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("components/operator/HomeAvantiqoIntelligence.jsx", "utf8");
const liveRoute = fs.readFileSync("app/api/operator/live-execution/route.js", "utf8");
const attentionRoute = fs.readFileSync("app/api/operator/attention/route.js", "utf8");

test("Business Partner home does not prewarm or poll Code runtime", () => {
  assert.doesNotMatch(home, /\/api\/operator\/code\/prewarm/);
  assert.doesNotMatch(home, /CODE_PREWARM_/);
});

test("Business Partner live execution API never imports or projects Code progress", () => {
  assert.doesNotMatch(liveRoute, /CodeAILiveProgressRuntime/);
  assert.doesNotMatch(liveRoute, /loadCodeAILiveProgress|codeProjection|lane: "code"/);
  assert.match(liveRoute, /intelligence_product: "business_partner"/);
});

test("Business Partner attention resolves Party identity per selected organization", () => {
  assert.match(attentionRoute, /resolveStaffPartyForOrganization/);
  assert.match(attentionRoute, /organizationId: access\.organizationId \|\| organizationId/);
  assert.doesNotMatch(attentionRoute, /access\.staff\?\.party_id\s*\|\|/);
});
