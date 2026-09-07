import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260907081000_hotel_atomic_pre_arrival_completion.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/pre-arrival/public/route.js", "utf8");

test("public pre-arrival completion is one guarded database transaction", () => {
  assert.match(migration, /create or replace function public\.hotel_complete_pre_arrival_guarded/);
  assert.match(migration, /from public\.hotel_pre_arrival_sessions[\s\S]*for update/);
  assert.match(migration, /from public\.hotel_bookings[\s\S]*for update/);
  assert.match(migration, /from public\.hotel_guests[\s\S]*for update/);
  assert.match(migration, /update public\.hotel_guests/);
  assert.match(migration, /update public\.hotel_pre_arrival_sessions/);
  assert.match(migration, /update public\.hotel_bookings/);
  assert.match(migration, /registration_consent/);
  assert.match(migration, /marketing_consent/);
});

test("public route cannot complete guest, session and booking with independent writes", () => {
  assert.match(route, /rpc\("hotel_complete_pre_arrival_guarded"/);
  assert.doesNotMatch(route, /from\("hotel_guests"\)\.update/);
  assert.doesNotMatch(route, /from\("hotel_pre_arrival_sessions"\)\.update\(\{ status: "COMPLETED"/);
  assert.doesNotMatch(route, /from\("hotel_bookings"\)\.update\(\{ pre_arrival_status: "COMPLETED"/);
});

test("Front Desk invalidation only happens after atomic completion returns", () => {
  const rpc = route.indexOf('rpc("hotel_complete_pre_arrival_guarded"');
  const broadcast = route.indexOf("broadcastHotelReadinessChanged");
  const action = route.indexOf('action: "PRE_ARRIVAL_COMPLETED"');
  assert.ok(rpc >= 0);
  assert.ok(broadcast > rpc);
  assert.ok(action > broadcast);
});

test("atomic completion authority is service-role-only", () => {
  const signature = "hotel_complete_pre_arrival_guarded(uuid,text,text,text,text,timestamptz,boolean)";
  assert.ok(migration.includes(`revoke all on function public.${signature} from public;`));
  assert.ok(migration.includes(`revoke all on function public.${signature} from anon;`));
  assert.ok(migration.includes(`revoke all on function public.${signature} from authenticated;`));
  assert.ok(migration.includes(`grant execute on function public.${signature} to service_role;`));
  assert.match(migration, /security invoker/);
});
