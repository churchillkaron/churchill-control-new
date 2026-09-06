import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906002500_hotel_booking_cancellation_evidence.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/bookings/cancel/route.js", "utf8");
const reservations = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/reservations/page.jsx", "utf8");

test("cancellation evidence is persisted on the canonical booking", () => {
  assert.match(migration, /cancelled_at timestamptz/);
  assert.match(migration, /cancellation_reason text/);
  assert.match(migration, /cancellation_detail text/);
  assert.match(migration, /Does not imply refund, fee, forfeiture, or folio treatment/);
});

test("only an unconsumed reservation can be cancelled", () => {
  assert.match(route, /organizationId: existing\.organization_id/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /Only a reservation that has not checked in can be cancelled/);
  assert.match(route, /\.eq\("status", "RESERVED"\)/);
  assert.match(route, /status: "CANCELLED"/);
  assert.match(route, /cancelled_at: now/);
  assert.match(route, /cancellation_reason: reason/);
  assert.match(route, /cancellation_detail: detail/);
});

test("operational cancellation does not invent a financial or channel outcome", () => {
  assert.match(route, /stayInventoryReleased: true/);
  assert.match(route, /groupInventoryStillProtected: Boolean\(booking\.group_id\)/);
  assert.match(route, /financialReviewRequired: Number\(booking\.paid_amount \|\| 0\) > 0/);
  assert.match(route, /cancellationFeePosted: false/);
  assert.match(route, /refundCreated: false/);
  assert.match(route, /depositForfeited: false/);
  assert.match(route, /folioChanged: false/);
  assert.match(route, /channelReportingRequired: Boolean\(booking\.channel_connection_id && booking\.external_reservation_id\)/);
});

test("Reservations UI requires human reason and confirmation", () => {
  assert.match(reservations, /Cancellation reason/);
  assert.match(reservations, /GUEST_REQUEST/);
  assert.match(reservations, /INVALID_PAYMENT/);
  assert.match(reservations, /OTHER/);
  assert.match(reservations, /Confirm cancellation/);
  assert.match(reservations, /\/api\/hotel\/bookings\/cancel/);
  assert.match(reservations, /does not automatically refund or forfeit deposits/);
  assert.match(reservations, /release a group allotment/);
  assert.match(reservations, /notify an OTA/);
});
