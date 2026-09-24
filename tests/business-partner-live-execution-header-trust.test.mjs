import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
const live = fs.readFileSync("app/api/operator/turn/live/route.js", "utf8");

test("authoritative turn strips client-supplied live execution identity", () => {
  assert.match(route, /export async function POST\(request, internal = \{\}\)/);
  assert.match(route, /trustedHeaders\.delete\("x-avantiqo-live-execution-id"\)/);
  assert.match(route, /const trustedLiveExecutionId = text\(internal\?\.liveExecutionId\)/);
  assert.match(route, /trustedHeaders\.set\("x-avantiqo-live-execution-id", trustedLiveExecutionId\)/);
});

test("only live wrapper supplies trusted live execution identity to the normal turn", () => {
  assert.match(live, /runOperatorTurnPost\(request, \{[\s\S]*liveExecutionId/);
});

test("authoritative turn rebuilds a native Request without wrapping a Next.js request object", () => {
  assert.match(route, /const requestBody = \["GET", "HEAD"\]\.includes/);
  assert.match(route, /request = new Request\(request\.url, \{/);
  assert.match(route, /await request\.arrayBuffer\(\)/);
  assert.doesNotMatch(route, /new Request\(request, \{/);
});
