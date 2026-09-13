import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const cap = fs.readFileSync(new URL("../lib/platform/capabilities/createIntelligenceEconomicsCapability.js", import.meta.url), "utf8");
const runtime = fs.readFileSync(new URL("../lib/platform/runtime/PlatformDomainRuntime.js", import.meta.url), "utf8");
const route = fs.readFileSync(new URL("../app/api/operator/turn/route.js", import.meta.url), "utf8");
test("intelligence economics is a read-only operator front door", () => {
  assert.match(cap, /operatorMode: "read"/);
  assert.match(cap, /operatorAutoExecute: true/);
  assert.match(cap, /operatorRequiresConfirmation: false/);
  assert.match(cap, /show this month intelligence usage/);
  assert.match(runtime, /intelligence_economics: \{ read:/);
});
test("memory consolidation runs only after meaningful memory learning", () => {
  assert.match(route, /if \(longTermLearned > 0\)/);
  assert.match(route, /consolidateOperatorMemory/);
});
