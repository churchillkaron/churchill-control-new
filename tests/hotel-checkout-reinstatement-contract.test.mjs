import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906010000_hotel_checkout_reinstatement.sql", "utf8");
const transition = fs.readFileSync("lib/hotel/server/transitionHotelBooking.js", "utf8");
const route = fs.readFileSync("app/api/hotel/bookings/reinstate/route.js", "utf8");
const recovery = fs.readFileSync("components/workspace/hotel/HotelCheckoutRecovery.jsx", "utf8");
const frontDesk = fs.readFileSync("components/workspace/hotel/HotelFrontDeskWorkBoard.jsx", "utf8");
const frontDeskPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx", "utf8");

test("checkout records durable property business-day evidence and fails closed without configured property time", () => {
  assert.match(transition, /actual_check_out_business_date: checkoutOperationalDate\.businessDate/);
  assert.match(transition, /!checkoutOperationalDate\.configured/);
  assert.match(transition, /checkoutOperationalDate\.compatibilityFallback/);
  assert.match(transition, /Configure the property's operational day before checking out a guest/);
});

test("reinstatement is same-business-day, open-day and transaction governed", () => {
  assert.match(migration, /create or replace function public\.hotel_reinstate_checkout/);
  assert.match(migration, /for update/);
  assert.match(migration, /upper\(coalesce\(v_booking\.status, ''\)\) <> 'CHECKED_OUT'/);
  assert.match(migration, /actual_check_out_business_date <> p_business_date/);
  assert.match(migration, /hotel_night_audits/);
  assert.match(migration, /status, ''\)\) = 'CLOSED'/);
  assert.match(migration, /Selected room conflicts with another active or same-day arriving stay/);
  assert.match(migration, /other\.check_in_date <= p_business_date/);
});

test("housekeeping work is respected and an untouched turnover is cancelled, never falsely completed", () => {
  assert.match(migration, /'IN_PROGRESS', 'AWAITING_INSPECTION'/);
  assert.match(migration, /Housekeeping has already started on the original room/);
  assert.match(migration, /task_status = 'CANCELLED'/);
  const cancellationBlock = migration.match(/if v_pending_turnover_id is not null then([\s\S]*?)end if;/i)?.[1] || "";
  assert.doesNotMatch(cancellationBlock, /completed_at\s*=/);
  assert.match(cancellationBlock, /guest stay reinstated before cleaning began/i);
});

test("reinstatement preserves original commercial and checkout truth", () => {
  assert.match(migration, /previous_actual_check_out_at/);
  assert.match(migration, /without changing folio, payment, charge, booked departure, or original checkout history/i);
  assert.doesNotMatch(migration, /update public\.hotel_folios/);
  assert.doesNotMatch(migration, /update public\.hotel_payment_transactions/);
  assert.doesNotMatch(migration, /check_out_date\s*=/);
  assert.doesNotMatch(migration, /actual_check_out_at\s*=/);
});

test("recovery API re-reads authority before PREPARE and CONFIRM", () => {
  assert.match(route, /action must be PREPARE or CONFIRM/);
  assert.match(route, /getHotelOperationalDate/);
  assert.match(route, /operationalDate\.compatibilityFallback/);
  assert.match(route, /actual_check_out_business_date/);
  assert.match(route, /hotel_night_audits/);
  assert.match(route, /housekeepingStarted/);
  assert.match(route, /alternativeRooms/);
  assert.match(route, /allowedRoomIds/);
  assert.match(route, /\.rpc\("hotel_reinstate_checkout"/);
  assert.match(route, /financialHistoryChanged: false/);
  assert.match(route, /folioReopened: false/);
  assert.match(route, /paymentsChanged: false/);
  assert.match(route, /bookedDepartureChanged: false/);
});

test("Front Desk exposes recovery as a human correction, not a raw state reversal", () => {
  assert.match(frontDeskPage, /HotelCheckoutRecovery/);
  assert.match(recovery, /Wrong guest checked out\? Put the stay back safely\./);
  assert.match(recovery, /Wrong checkout \/ guest still staying/);
  assert.match(recovery, /Why are we correcting the checkout\?/);
  assert.match(recovery, /Put guest back in house/);
  assert.match(recovery, /Nothing financial is undone automatically/);
  assert.match(recovery, /Housekeeping has already started/);
});

test("Front Desk has no browser-date authority fallback", () => {
  assert.match(frontDesk, /if \(booking\?\.operational_day\?\.configured !== true\) return ""/);
  assert.doesNotMatch(frontDesk, /businessDate\(booking\).*new Date\(\)\.toISOString/);
  assert.match(frontDesk, /Boolean\(day\).*status\(booking\.status\) === "RESERVED"/);
  assert.match(frontDesk, /Date-driven arrivals, departures, no-shows and checkouts are hidden/);
});

test("reinstatement audit access follows the live organization user model", () => {
  assert.match(migration, /public\.organization_users ou/);
  assert.match(migration, /public\.staff_accounts sa/);
  assert.match(migration, /coalesce\(sa\.auth_user_id, sa\.user_id\) = auth\.uid\(\)/);
  assert.doesNotMatch(migration, /organization_members/);
});
