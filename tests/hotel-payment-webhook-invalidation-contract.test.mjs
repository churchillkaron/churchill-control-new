import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const webhook = fs.readFileSync("app/api/billing/webhook/route.js", "utf8");
const broadcaster = fs.readFileSync("lib/hotel/server/broadcastHotelReadinessChanged.js", "utf8");

test("Hotel webhook resolves invalidation scope from persisted transaction truth", () => {
  assert.match(webhook, /function getHotelTransactionScope/);
  assert.match(webhook, /from\("hotel_payment_transactions"\)/);
  assert.match(webhook, /select\("id,organization_id,status,transaction_type"\)/);
  assert.match(webhook, /\.eq\("processor_mode", "AVANTIQO_GATEWAY"\)/);
  assert.doesNotMatch(webhook, /invalidateHotelSettlement\(session\?\.metadata\?\.organizationId/);
  assert.doesNotMatch(webhook, /invalidateHotelSettlement\(refund\?\.metadata\?\.organizationId/);
});

test("payment and refund terminal states invalidate after persistence/finalization", () => {
  const paymentRpc = webhook.indexOf('rpc("hotel_finalize_gateway_payment_with_finance"');
  const paymentBroadcast = webhook.indexOf('invalidateHotelSettlement(scope.organization_id, "PAYMENT_SETTLED")');
  assert.ok(paymentRpc >= 0 && paymentBroadcast > paymentRpc);

  const refundRpc = webhook.indexOf('rpc("hotel_finalize_gateway_refund_with_finance"');
  const refundBroadcast = webhook.indexOf('invalidateHotelSettlement(scope.organization_id, "REFUND_SETTLED")');
  assert.ok(refundRpc >= 0 && refundBroadcast > refundRpc);

  const failureUpdate = webhook.indexOf('.update({\n      status: "FAILED"');
  const failureBroadcast = webhook.indexOf('invalidateHotelSettlement(scope.organization_id, scope.transaction_type === "REFUND" ? "REFUND_FAILED" : "PAYMENT_FAILED")');
  assert.ok(failureUpdate >= 0 && failureBroadcast > failureUpdate);
});

test("Realtime remains data-free invalidation only", () => {
  assert.match(broadcaster, /payload: \{[\s\S]*source:[\s\S]*action:/);
  assert.doesNotMatch(broadcaster, /payload: \{[\s\S]*bookingId/);
  assert.doesNotMatch(broadcaster, /payload: \{[\s\S]*transactionId/);
  assert.doesNotMatch(broadcaster, /payload: \{[\s\S]*amount/);
});
