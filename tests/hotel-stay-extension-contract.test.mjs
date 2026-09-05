import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260905210000_hotel_stay_extension_guard.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/bookings/extend/route.js", "utf8");
const frontDesk = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx", "utf8");

test("stay extension is an atomic checked-in inventory decision", () => {
  assert.match(migration, /hotel_extend_checked_in_stay_guarded/);
  assert.match(migration, /for update/i);
  assert.match(migration, /CHECKED_IN/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /b\.id <> v_booking\.id/);
  assert.match(migration, /b\.room_id = v_booking\.room_id/);
  assert.match(migration, /HOTEL_INVENTORY_CONFLICT/);
});

test("stay extension preserves group-held room-type inventory", () => {
  assert.match(migration, /hotel_group_room_blocks/);
  assert.match(migration, /deduct_inventory = true/);
  assert.match(migration, /v_other_held/);
  assert.match(migration, /v_own_alloc/);
  assert.match(migration, /group block has no remaining/);
});

test("stay extension changes departure only and leaves pricing explicit", () => {
  assert.match(migration, /set check_out_date = p_new_check_out_date/);
  assert.doesNotMatch(migration, /set[\s\S]{0,120}total_amount\s*=/i);
  assert.match(migration, /'pricing_changed', false/);
  assert.match(migration, /'pricing_review_required', true/);
});

test("extension API scopes from the authoritative booking and calls the guarded RPC", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /organizationId: existing\.organization_id/);
  assert.match(route, /hotel_extend_checked_in_stay_guarded/);
  assert.match(route, /p_organization_id: access\.organizationId/);
  assert.match(route, /Only a checked-in stay can be extended/);
  assert.match(route, /HOTEL_INVENTORY_CONFLICT/);
});

test("Front Desk resolves a due-out through an explicit governed extension", () => {
  assert.match(frontDesk, /Extend stay/);
  assert.match(frontDesk, /\/api\/hotel\/bookings\/extend/);
  assert.match(frontDesk, /type="date"/);
  assert.match(frontDesk, /min=\{nextDate\(booking\.check_out_date\)\}/);
  assert.match(frontDesk, /Pricing and folio are not changed automatically/);
  assert.match(frontDesk, /room-type capacity and protected group inventory/);
});
