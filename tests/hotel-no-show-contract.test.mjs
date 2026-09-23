import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/hotel/bookings/no-show/route.js", "utf8");
const frontDesk = fs.readFileSync("components/workspace/hotel/HotelFrontDeskWorkBoard.jsx", "utf8");
const nightAudit = fs.readFileSync("app/api/hotel/night-audit/route.js", "utf8");

test("no-show authority is derived from the booking and property operational date", () => {
  assert.match(route, /getHotelOperationalDate/);
  assert.match(route, /const businessDate = operationalDate\.businessDate/);
  assert.doesNotMatch(route, /body\.businessDate|body\.business_date/);
  assert.match(route, /organizationId: existing\.organization_id/);
  assert.match(route, /propertyId: existing\.property_id/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /Only a reserved arrival can be recorded as a no-show/);
  assert.match(route, /arrivalDate >= businessDate/);
  assert.match(route, /\.eq\("status", "RESERVED"\)/);
  assert.match(route, /\.lt\("check_in_date", businessDate\)/);
});

test("no-show releases only reservation stay inventory and preserves commercial truth", () => {
  assert.match(route, /update\(\{ status: "NO_SHOW", updated_at: now \}\)/);
  assert.match(route, /stayInventoryReleased: true/);
  assert.match(route, /groupInventoryStillProtected: Boolean\(booking\.group_id\)/);
  assert.match(route, /financialReviewRequired: true/);
  assert.match(route, /pricingChanged: false/);
  assert.match(route, /paymentsChanged: false/);
  assert.match(route, /folioChanged: false/);
  assert.match(route, /channelReportingRequired: Boolean\(booking\.channel_connection_id && booking\.external_reservation_id\)/);
});

test("Front Desk exposes no-show only after the arrival date has passed", () => {
  assert.match(frontDesk, /No-show/);
  assert.match(frontDesk, /\/api\/hotel\/bookings\/no-show/);
  assert.match(frontDesk, /dateValue\(booking\.check_in_date\) >= day/);
  assert.match(frontDesk, /body: JSON\.stringify\(\{ bookingId: booking\.id \}\)/);
  assert.match(frontDesk, /Confirm no-show/);
  assert.match(frontDesk, /does not silently decide deposit, refund, folio, group allotment or OTA treatment/);
});

test("recording NO_SHOW resolves the Night Audit unresolved-arrival blocker", () => {
  assert.match(nightAudit, /booking\.status === "RESERVED" && booking\.check_in_date <= businessDate/);
  assert.match(nightAudit, /ARRIVAL_NOT_RESOLVED/);
  assert.doesNotMatch(nightAudit, /booking\.status === "NO_SHOW"/);
});
