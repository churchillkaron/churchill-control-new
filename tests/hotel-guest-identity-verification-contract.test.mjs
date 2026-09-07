import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260907084000_hotel_guest_identity_verification.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/bookings/verify-identity/route.js", "utf8");
const readiness = fs.readFileSync("lib/hotel/server/getHotelArrivalReadiness.js", "utf8");
const frontDesk = fs.readFileSync("components/workspace/hotel/HotelFrontDeskWorkBoard.jsx", "utf8");

test("identity verification stores append-only evidence without identity-document contents", () => {
  assert.match(migration, /create table if not exists public\.hotel_guest_identity_verifications/);
  assert.match(migration, /verified_by_staff_account_id uuid not null/);
  assert.match(migration, /verification_method text not null/);
  assert.doesNotMatch(migration, /hotel_guest_identity_verifications[\s\S]{0,900}identity_document_path\s+text/i);
  assert.doesNotMatch(migration, /hotel_guest_identity_verifications[\s\S]{0,900}document_number\s+text/i);
  assert.match(migration, /alter table public\.hotel_guest_identity_verifications enable row level security/);
});

test("guarded identity verification owns evidence and guest readiness projection atomically", () => {
  assert.match(migration, /create or replace function public\.hotel_verify_guest_identity_guarded/);
  assert.match(migration, /from public\.hotel_bookings[\s\S]*for update/);
  assert.match(migration, /from public\.hotel_guests[\s\S]*for update/);
  assert.match(migration, /insert into public\.hotel_guest_identity_verifications/);
  assert.match(migration, /set identity_verified_at = v_verified_at/);
  assert.match(migration, /already_verified/);
  assert.match(migration, /security invoker/);
});

test("identity RPC is server-only", () => {
  const signature = "hotel_verify_guest_identity_guarded(uuid,uuid,uuid,text)";
  assert.ok(migration.includes(`revoke execute on function public.${signature} from public;`));
  assert.ok(migration.includes(`revoke execute on function public.${signature} from anon;`));
  assert.ok(migration.includes(`revoke execute on function public.${signature} from authenticated;`));
  assert.ok(migration.includes(`grant execute on function public.${signature} to service_role;`));
});

test("staff API requires authenticated organization staff and broadcasts only after verification commits", () => {
  assert.match(route, /requireOrganizationAccess\(\{ organizationId, request \}\)/);
  assert.match(route, /access\.access\?\.staffAccountId/);
  assert.match(route, /rpc\("hotel_verify_guest_identity_guarded"/);
  assert.match(route, /p_verified_by_staff_account_id: access\.access\.staffAccountId/);
  assert.match(route, /source: "front-desk-identity"/);
  assert.match(route, /action: "IDENTITY_VERIFIED"/);

  const rpc = route.indexOf('rpc("hotel_verify_guest_identity_guarded"');
  const broadcastCall = route.indexOf("await broadcastHotelReadinessChanged", rpc);
  assert.ok(rpc >= 0);
  assert.ok(broadcastCall > rpc);
});

test("identity remains advisory while Front Desk makes the attention actionable", () => {
  assert.match(readiness, /issue\("IDENTITY_NOT_VERIFIED"[\s\S]*false\)/);
  assert.match(readiness, /const canCheckIn = blockers\.length === 0/);
  assert.match(frontDesk, /code === "IDENTITY_NOT_VERIFIED"/);
  assert.match(frontDesk, />Verify identity</);
  assert.match(frontDesk, /transition\(booking, "CHECK_IN"\)/);
  assert.match(frontDesk, /verificationMethod: "IN_PERSON_DOCUMENT_REVIEW"/);
});
