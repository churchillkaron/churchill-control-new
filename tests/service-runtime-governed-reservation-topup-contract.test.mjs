import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", "utf8");

test("async settlement may top up only inside the persisted service cost guard", () => {
  assert.match(source, /ensureGovernedReservationCoverage/);
  assert.match(source, /service_cost_guard_maximum_customer_price/);
  assert.match(source, /charge > approvedMaximum \+ 0\.000001/);
  assert.match(source, /ACTUAL_USAGE_GOVERNED_RESERVATION_TOPUP/);
  assert.match(source, /idempotency_key: `\$\{usageId\}:actual-usage-topup`/);
  assert.match(source, /reservedAmount: reservationCoverage\.reserved_amount/);
  assert.match(source, /reservation_coverage: reservationCoverage/);
});
