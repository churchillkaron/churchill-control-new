import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const operationalDate = fs.readFileSync("lib/hotel/server/getHotelOperationalDate.js", "utf8");
const nightAudit = fs.readFileSync("app/api/hotel/night-audit/route.js", "utf8");
const noShow = fs.readFileSync("app/api/hotel/bookings/no-show/route.js", "utf8");
const earlyDeparture = fs.readFileSync("app/api/hotel/bookings/early-departure/route.js", "utf8");
const transition = fs.readFileSync("lib/hotel/server/transitionHotelBooking.js", "utf8");

test("Hotel operational date is property-scoped and timezone aware", () => {
  assert.match(operationalDate, /from\("hotel_properties"\)/);
  assert.match(operationalDate, /\.eq\("organization_id", organization\)/);
  assert.match(operationalDate, /\.eq\("id", property\)/);
  assert.match(operationalDate, /Intl\.DateTimeFormat/);
  assert.match(operationalDate, /timeZone: timezone/);
  assert.match(operationalDate, /business_day_cutoff_minutes/);
  assert.match(operationalDate, /wallClockMinutes < cutoff/);
  assert.match(operationalDate, /compatibilityFallback: !configuredTimezone/);
});

test("Night Audit no longer accepts client authority over business date", () => {
  assert.match(nightAudit, /getHotelOperationalDate/);
  assert.doesNotMatch(nightAudit, /searchParams\.get\("businessDate"\)/);
  assert.doesNotMatch(nightAudit, /body\.businessDate/);
  assert.match(nightAudit, /const businessDate = operationalDate\.businessDate/);
  assert.match(nightAudit, /control_summary/);
  assert.match(nightAudit, /compatibilityFallback/);
});

test("arrival and departure exception controls share the same operational day", () => {
  for (const source of [noShow, earlyDeparture]) {
    assert.match(source, /getHotelOperationalDate/);
    assert.match(source, /propertyId: existing\.property_id/);
    assert.match(source, /businessDate = operationalDate\.businessDate/);
  }
  assert.match(transition, /getHotelOperationalDate/);
  assert.match(transition, /propertyId: booking\.property_id/);
  assert.match(transition, /businessDate: operationalDate\.businessDate/);
});
