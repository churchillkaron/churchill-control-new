import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906003000_hotel_early_departure_control.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/bookings/early-departure/route.js", "utf8");
const readiness = fs.readFileSync("lib/hotel/server/getHotelDepartureReadiness.js", "utf8");
const transition = fs.readFileSync("lib/hotel/server/transitionHotelBooking.js", "utf8");
const control = fs.readFileSync("components/workspace/hotel/HotelEarlyDepartureControl.jsx", "utf8");
const stayControl = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/stay-control/page.jsx", "utf8");

test("booked departure is preserved while actual departure gets separate evidence", () => {
  assert.match(migration, /actual_check_out_at timestamptz/);
  assert.match(migration, /early_departure_business_date date/);
  assert.match(migration, /early_departure_review_status text/);
  assert.match(migration, /early_departure_reviewed_at timestamptz/);
  assert.match(migration, /early_departure_review_note text/);
  assert.match(migration, /booked check_out_date remains the original scheduled stay truth/);
});

test("early departure eligibility is derived server-side and limited to in-house future stays", () => {
  assert.match(route, /const businessDate = todayIso\(\)/);
  assert.doesNotMatch(route, /body\.businessDate/);
  assert.match(route, /organizationId: existing\.organization_id/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /Only an in-house stay can use early departure/);
  assert.match(route, /scheduledDeparture <= businessDate/);
  assert.match(route, /\.eq\("status", "CHECKED_IN"\)/);
  assert.match(route, /\.gt\("check_out_date", businessDate\)/);
});

test("early departure requires preparation and explicit commercial review", () => {
  assert.match(route, /action must be PREPARE or CONFIRM/);
  assert.match(route, /early_departure_review_status: "REVIEW_REQUIRED"/);
  assert.match(route, /Prepare early departure before confirming commercial review/);
  assert.match(route, /early_departure_review_status: "CONFIRMED"/);
  assert.match(route, /Describe the reviewed unused-night, refund, fee or no-adjustment treatment/);
  assert.match(route, /refundCreated: false/);
  assert.match(route, /cancellationFeePosted: false/);
  assert.match(route, /unusedNightChargePosted: false/);
  assert.match(route, /depositForfeited: false/);
  assert.match(route, /folioChanged: false/);
  assert.match(route, /bookingPriceChanged: false/);
});

test("future-dated normal checkout fails closed until early departure review is confirmed", () => {
  assert.match(readiness, /EARLY_DEPARTURE_REVIEW_REQUIRED/);
  assert.match(readiness, /scheduledDeparture > operationalDate/);
  assert.match(readiness, /earlyDepartureReviewStatus !== "CONFIRMED"/);
  assert.match(readiness, /confirm the unused-night \/ refund \/ fee treatment before check-out/);
});

test("checkout records actual departure without rewriting booked checkout date", () => {
  assert.match(transition, /businessDate: new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  assert.match(transition, /actual_check_out_at: changedAt/);
  assert.doesNotMatch(transition, /check_out_date: changedAt/);
  assert.match(transition, /status: transition\.toStatus/);
  assert.match(transition, /task_type: "CLEANING"/);
});

test("operator workflow lives beside the real stay and folio controls", () => {
  assert.match(stayControl, /HotelEarlyDepartureControl/);
  assert.match(stayControl, /booking=\{selected\}/);
  assert.match(stayControl, /onChanged=\{load\}/);
  assert.match(control, /\/api\/hotel\/bookings\/early-departure/);
  assert.match(control, /action: "PREPARE"/);
  assert.match(control, /action: "CONFIRM"/);
  assert.match(control, /Record early departure/);
  assert.match(control, /Confirm commercial review/);
  assert.match(control, /does not change the booked departure, room price, folio, deposit, refund or fee/);
  assert.match(control, /Confirmation records the decision; it does not create money movement/);
  assert.match(control, /Open Hotel payments/);
});
