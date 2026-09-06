import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906004500_hotel_property_operational_day.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/properties/operational-day/route.js", "utf8");
const setup = fs.readFileSync("components/workspace/hotel/HotelOperationalDaySetup.jsx", "utf8");
const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/hotel-operational-day/page.jsx", "utf8");
const nav = fs.readFileSync("components/workspace/hotel/HotelWorkspaceUI.jsx", "utf8");

test("property operational day settings are explicit and bounded", () => {
  assert.match(migration, /time_zone text/);
  assert.match(migration, /business_day_cutoff_minutes integer/);
  assert.match(migration, /operational_day_configured_at timestamptz/);
  assert.match(migration, /between 0 and 720/);
  assert.match(migration, /runtime must not guess a timezone/);
});

test("settings endpoint validates authority timezone and cutoff server-side", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /Intl\.DateTimeFormat/);
  assert.match(route, /timeZone: timezone/);
  assert.match(route, /number < 0 \|\| number > 720/);
  assert.match(route, /\.eq\("organization_id", access\.organizationId\)/);
  assert.match(route, /\.eq\("id", propertyId\)/);
  assert.match(route, /operational_day_configured_at: changedAt/);
  assert.match(route, /deriveHotelOperationalDate\(property\)/);
});

test("operator can see and resolve properties still in UTC compatibility mode", () => {
  assert.match(page, /Compatibility mode/);
  assert.match(page, /UTC fallback until an operator configures the property/);
  assert.match(page, /HotelOperationalDaySetup/);
  assert.match(setup, /IANA timezone/);
  assert.match(setup, /Business-day cutoff/);
  assert.match(setup, /Asia\/Bangkok/);
  assert.match(setup, /REVIEW_REQUIRED/);
  assert.match(nav, /id: "operational-day"/);
  assert.match(nav, /route: "hotel-operational-day"/);
});
