import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906163000_hotel_post_checkout_refund_adjustment.sql", "utf8");
const paymentsRoute = fs.readFileSync("app/api/hotel/payments/route.js", "utf8");

test("closed-folio refund is rejected before provider money movement unless the stay is checked out", () => {
  assert.match(migration, /create trigger hotel_payment_transactions_refund_request_guard/);
  assert.match(migration, /before insert on public\.hotel_payment_transactions/);
  assert.match(migration, /v_folio_status = 'CLOSED'/);
  assert.match(migration, /v_booking_status <> 'CHECKED_OUT'/);
  assert.match(migration, /closed folio can only be refunded after checkout/);

  const routeContext = paymentsRoute.indexOf("const refundContext = await getRefundContext");
  const refundInsert = paymentsRoute.indexOf('transaction_type: "REFUND"');
  const providerCall = paymentsRoute.indexOf("stripe.refunds.create");
  assert.ok(routeContext >= 0 && routeContext < refundInsert && refundInsert < providerCall);
  assert.match(paymentsRoute, /CLOSED_FOLIO_STAY_NOT_CHECKED_OUT/);
});

test("post-checkout refund is an immutable adjustment rather than a folio rewrite", () => {
  assert.match(migration, /v_post_checkout_adjustment :=[\s\S]*v_tx\.transaction_type = 'REFUND'[\s\S]*v_folio_status = 'CLOSED'[\s\S]*v_booking_status = 'CHECKED_OUT'/);
  assert.match(migration, /if not v_post_checkout_adjustment then[\s\S]*insert into public\.hotel_folio_lines/);
  assert.match(migration, /if not v_post_checkout_adjustment then[\s\S]*update public\.hotel_bookings[\s\S]*update public\.hotel_folios/);
  assert.match(migration, /'closed_folio_immutable', true/);
  assert.match(migration, /'certified_booking_immutable', true/);
  assert.match(migration, /'certified_history_unchanged', v_post_checkout_adjustment/);
});

test("refund lifecycle still updates the refundable parent and remains idempotent", () => {
  assert.match(migration, /select \* into v_parent[\s\S]*for update/);
  assert.match(migration, /refunded_amount = refunded_amount \+ v_tx\.amount/);
  assert.match(migration, /refunded_amount \+ v_tx\.amount <= amount \+ 0\.005/);
  assert.match(migration, /if v_tx\.status = 'SETTLED' then[\s\S]*'unchanged', true/);
});

test("refund settlement carries current property-day evidence without replacing Finance date authority", () => {
  assert.match(migration, /add column if not exists settlement_business_date date/);
  assert.match(migration, /hotel_business_date_from_settings/);
  assert.match(migration, /settlement_business_date = coalesce\(settlement_business_date, v_settlement_business_date\)/);
  assert.match(migration, /'original_checkout_business_date', v_booking\.actual_check_out_business_date/);
  assert.match(migration, /'adjustment_settlement_business_date', v_settlement_business_date/);
});

test("Hotel devices are invalidated after authoritative payment and refund state changes", () => {
  assert.match(paymentsRoute, /broadcastHotelReadinessChanged/);
  assert.match(paymentsRoute, /source: "hotel-payment-action"/);
  for (const action of ["PAYMENT_PENDING", "PAYMENT_FAILED", "REFUND_PENDING", "REFUND_FAILED", "REFUND_SETTLED"]) {
    assert.ok(paymentsRoute.includes(`broadcastPaymentReadiness(auth.organizationId, "${action}")`));
  }

  const paymentSave = paymentsRoute.indexOf("provider_session_id: session.id");
  const paymentPendingBroadcast = paymentsRoute.indexOf('broadcastPaymentReadiness(auth.organizationId, "PAYMENT_PENDING")');
  assert.ok(paymentSave >= 0 && paymentSave < paymentPendingBroadcast);

  const refundProviderReference = paymentsRoute.indexOf("provider_refund_id: stripeRefund.id");
  const refundPendingBroadcast = paymentsRoute.indexOf('broadcastPaymentReadiness(auth.organizationId, "REFUND_PENDING")');
  const refundFinalize = paymentsRoute.indexOf('rpc("hotel_finalize_gateway_refund_with_finance"');
  const refundSettledBroadcast = paymentsRoute.indexOf('broadcastPaymentReadiness(auth.organizationId, "REFUND_SETTLED")');
  assert.ok(refundProviderReference >= 0 && refundProviderReference < refundPendingBroadcast);
  assert.ok(refundFinalize >= 0 && refundFinalize < refundSettledBroadcast);
});

test("gateway finalizer remains server-only", () => {
  assert.match(migration, /security invoker/);
  assert.ok(migration.includes("revoke all on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) from authenticated;"));
  assert.ok(migration.includes("grant execute on function public.hotel_finalize_gateway_transaction(uuid,text,text,text) to service_role;"));
});
