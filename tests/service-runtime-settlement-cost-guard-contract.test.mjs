import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("service settlement forwards the same approved ceiling on immediate and recovered paths", () => {
  const source = fs.readFileSync(
    new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /async function settleReservation\(\{[\s\S]*maximumChargeAmount = null/);
  assert.equal((source.match(/maximumChargeAmount: [^\n]*service_cost_guard_maximum_customer_price[^\n]*/g) || []).length, 2);
  assert.equal((source.match(/maximumAmount: [^\n]*service_cost_guard_maximum_customer_price[^\n]*/g) || []).length, 0);
  assert.match(source, /if \(reserved === 0 && charge === 0\)/);
  assert.match(source, /let reservationTopUp = 0/);
});
