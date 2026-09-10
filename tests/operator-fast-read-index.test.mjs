import assert from "node:assert/strict";
import test from "node:test";
import { listOperatorFastReads } from "../lib/operator/runtime/OperatorFastReadIndex.js";
import { rankOperatorCapabilities } from "../lib/operator/runtime/OperatorCapabilityMatcher.js";

const reads = listOperatorFastReads();
for (const [message, expected] of [
  ["customer invoice moonshine", "finance.customer_invoices.read"],
  ["what is our bank balance", "finance.cash_management.read"],
  ["show trial balance", "finance.trial_balance.read"],
  ["who is absent today", "people.attendance.read"],
  ["hotel arrivals today", "solutions.hotel_bookings.read"],
  ["show latest studio video", "creative.assets.read"],
  ["show documents", "documents.documents.read"],
]) {
  test(`${message} resolves through lightweight Fast Read Index`, () => {
    const ranked = rankOperatorCapabilities({ message, capabilities: reads, modes: ["read"], limit: 3 });
    assert.equal(ranked[0]?.capability?.key, expected);
  });
}
