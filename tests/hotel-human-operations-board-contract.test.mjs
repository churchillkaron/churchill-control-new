import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const bookingList = fs.readFileSync("app/api/hotel/bookings/list/route.js", "utf8");
const frontDesk = fs.readFileSync("components/workspace/hotel/HotelFrontDeskWorkBoard.jsx", "utf8");
const frontDeskPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx", "utf8");
const nightAuditRoute = fs.readFileSync("app/api/hotel/night-audit/route.js", "utf8");
const nightAuditPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/night-audit/page.jsx", "utf8");
const noShowRoute = fs.readFileSync("app/api/hotel/bookings/no-show/route.js", "utf8");
const earlyDepartureRoute = fs.readFileSync("app/api/hotel/bookings/early-departure/route.js", "utf8");

test("Front Desk derives due work from each property's server-owned operating day", () => {
  assert.match(bookingList, /deriveHotelOperationalDate/);
  assert.match(bookingList, /operational_day:/);
  assert.match(bookingList, /businessDate: operationalDay\.businessDate/);
  assert.match(frontDesk, /function businessDate\(booking\)/);
  assert.match(frontDesk, /dateValue\(booking\.check_in_date\) <= businessDate\(booking\)/);
  assert.match(frontDesk, /dateValue\(booking\.check_out_date\) <= businessDate\(booking\)/);
  assert.doesNotMatch(frontDesk, /const today = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("Front Desk presents direct human resolutions rather than raw lifecycle states", () => {
  assert.match(frontDeskPage, /HotelFrontDeskWorkBoard/);
  assert.match(frontDesk, /Work the guest/);
  assert.match(frontDesk, /Choose ready room/);
  assert.match(frontDesk, /Collect deposit/);
  assert.match(frontDesk, /Confirm no-show/);
  assert.match(frontDesk, /Confirm extension/);
  assert.match(frontDesk, /Leave early/);
  assert.match(frontDesk, /Settle guest/);
  assert.match(frontDesk, /Close zero folio/);
});

test("Night Audit cannot close an unconfigured property clock or accept a browser-selected business date", () => {
  assert.match(nightAuditRoute, /OPERATIONAL_DAY_UNCONFIGURED/);
  assert.match(nightAuditRoute, /compatibilityFallback/);
  assert.match(nightAuditRoute, /Configure operational day/);
  assert.doesNotMatch(nightAuditRoute, /body\.businessDate/);
  assert.doesNotMatch(nightAuditRoute, /searchParams\.get\("businessDate"\)/);
  assert.doesNotMatch(nightAuditPage, /type="date"/);
  assert.doesNotMatch(nightAuditPage, /setBusinessDate/);
  assert.match(nightAuditPage, /Staff choose the property, never the date/);
});

test("date-sensitive guest decisions fail closed until the property operational day is certified", () => {
  assert.match(noShowRoute, /compatibilityFallback \|\| !operationalDate\.configured/);
  assert.match(noShowRoute, /before recording a date-sensitive no-show/);
  assert.match(earlyDepartureRoute, /compatibilityFallback \|\| !operationalDate\.configured/);
  assert.match(earlyDepartureRoute, /before recording a date-sensitive early departure/);
});

test("Day Close is an exception work board with exact resolution routes", () => {
  assert.match(nightAuditRoute, /ARRIVAL_NOT_RESOLVED/);
  assert.match(nightAuditRoute, /DEPARTURE_NOT_RESOLVED/);
  assert.match(nightAuditRoute, /OPEN_DEPARTURE_FOLIO/);
  assert.match(nightAuditRoute, /hotel_guests\(full_name\)/);
  assert.match(nightAuditRoute, /hotel_rooms\(room_number\)/);
  assert.match(nightAuditRoute, /resolution: \{ route: "front-desk"/);
  assert.match(nightAuditRoute, /resolution: \{ route: "stay-control"/);
  assert.match(nightAuditPage, /Human work queue/);
  assert.match(nightAuditPage, /Close clean business day/);
  assert.match(nightAuditPage, /stale green screen cannot close a property/i);
});
