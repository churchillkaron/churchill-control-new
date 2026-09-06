import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const operationalDay = fs.readFileSync("lib/hotel/server/getHotelOperationalDate.js", "utf8");
const departureReadiness = fs.readFileSync("lib/hotel/server/getHotelDepartureReadiness.js", "utf8");
const handoverRuntime = fs.readFileSync("lib/hotel/server/getHotelShiftHandover.js", "utf8");
const handoverRoute = fs.readFileSync("app/api/hotel/shift-handover/route.js", "utf8");
const handoverBoard = fs.readFileSync("components/workspace/hotel/HotelShiftHandoverBoard.jsx", "utf8");
const handoverPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/shift-handover/page.jsx", "utf8");
const hotelUI = fs.readFileSync("components/workspace/hotel/HotelWorkspaceUI.jsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260906011500_hotel_shift_handover_context.sql", "utf8");

test("Hotel operational day is explicitly governed rather than inferred from timezone alone", () => {
  assert.match(operationalDay, /configuredCutoffMinutes/);
  assert.match(operationalDay, /operational_day_configured_at/);
  assert.match(operationalDay, /configured: explicitlyConfigured/);
  assert.match(operationalDay, /compatibilityFallback: !explicitlyConfigured/);
});

test("departure readiness never invents the business date from the server clock", () => {
  assert.match(departureReadiness, /businessDate = null/);
  assert.match(departureReadiness, /OPERATIONAL_DAY_REQUIRED/);
  assert.doesNotMatch(departureReadiness, /businessDate = new Date\(\)\.toISOString/);
});

test("shift handover is derived from live Hotel source truth", () => {
  assert.match(handoverRuntime, /getHotelOperationalDate/);
  assert.match(handoverRuntime, /ARRIVAL_NOT_RESOLVED/);
  assert.match(handoverRuntime, /DEPARTURE_NOT_RESOLVED/);
  assert.match(handoverRuntime, /OPEN_DEPARTURE_FOLIO/);
  assert.match(handoverRuntime, /HOUSEKEEPING_/);
  assert.match(handoverRuntime, /CHANNEL_SYNC_EXCEPTION/);
  assert.match(handoverRuntime, /OPERATIONAL_DAY_UNCONFIGURED/);
  assert.match(handoverRuntime, /hotel_shift_handover_context/);
});

test("handover context cannot resolve or hide a live exception", () => {
  assert.doesNotMatch(handoverRoute, /"RESOLVE"/);
  assert.match(handoverRoute, /\["ACKNOWLEDGE", "ASSIGN", "NOTE", "CLEAR_ACKNOWLEDGEMENT"\]/);
  assert.match(handoverRoute, /const liveException = handover\.exceptions\.find/);
  assert.match(handoverRoute, /no longer live/);
  assert.match(migration, /never determines whether an exception is resolved/);
});

test("handover assignment is restricted to active organization staff", () => {
  assert.match(handoverRoute, /activeOrganizationStaff/);
  assert.match(handoverRoute, /Assigned staff member must be active in this organization/);
  assert.match(handoverRoute, /organization_users/);
  assert.match(handoverRoute, /staff_accounts/);
});

test("human handover UI distinguishes acknowledgement from resolution and returns to source work", () => {
  assert.match(handoverPage, /Shift Handover/);
  assert.match(handoverBoard, /What the next shift cannot miss/);
  assert.match(handoverBoard, /underlying booking, payment, room, housekeeping, channel or governance condition is actually fixed/);
  assert.match(handoverBoard, /Seen by shift/);
  assert.match(handoverBoard, /Human context only/);
  assert.match(handoverBoard, /Go fix it/);
  assert.match(hotelUI, /id: "shift-handover"/);
});
