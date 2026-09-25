import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/creative/release/runtime/CreativeApprovalRuntime.js", import.meta.url),
  "utf8",
);

test("production dossier approval propagates the approved ceiling and currency to the graph", () => {
  assert.match(source, /maximum_customer_price:\s*ceiling/);
  assert.match(source, /approved_cost:\s*ceiling/);
  assert.match(source, /approved_cost_ceiling:\s*ceiling/);
  assert.match(source, /approved_cost_currency:\s*approvedCurrency/);
  assert.match(source, /subject\.metadata\?\.currency/);
});