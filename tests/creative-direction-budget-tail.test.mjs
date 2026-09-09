import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");

test("direction can use the remaining approved budget below the nominal per-call envelope", () => {
  assert.doesNotMatch(source, /Number\(pricing\.customer_price\) > state\.remaining/);
  assert.match(source, /Math\.min\(\s*state\.remaining,\s*approvedPerCallMaximum/);
  assert.match(source, /maximum_customer_price: maximumForCall/);
});

test("settlement still fails closed above the approved monetary ceiling", () => {
  assert.match(source, /charged > Number\(approval\.maximum_per_call_customer_price\)/);
  assert.match(source, /charged > state\.remaining/);
});
