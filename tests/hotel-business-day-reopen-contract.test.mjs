import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260907082500_hotel_governed_day_reopen.sql", "utf8");
const barrier = fs.readFileSync("supabase/migrations/20260906161000_hotel_business_day_write_barrier.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/night-audit/route.js", "utf8");
const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/night-audit/page.jsx", "utf8");

test("reopen is restricted to the current governed property business day", () => {
  assert.match(migration, /hotel_current_business_date_guarded/);
  assert.match(migration, /HOTEL_DAY_REOPEN_HISTORICAL_FORBIDDEN/);
  assert.match(migration, /only the current property business day can be reopened/);
  assert.match(migration, /perform public\.hotel_lock_business_day/);
});

test("reopen preserves previous close evidence and writes a separate correction record", () => {
  assert.match(migration, /create table if not exists public\.hotel_business_day_corrections/);
  assert.match(migration, /prior_control_summary/);
  assert.match(migration, /prior_closed_at/);
  assert.match(migration, /performed_by_staff_account_id/);
  assert.match(migration, /previous_close_preserved/);
  assert.match(migration, /set status = 'REOPENED'/);
  assert.doesNotMatch(migration, /delete from public\.hotel_night_audits/);
});

test("REOPENED audit releases the existing closed-day mutation barrier without weakening historical CLOSED rows", () => {
  assert.match(barrier, /upper\(coalesce\(a\.status, ''\)\) = 'CLOSED'/);
  assert.match(migration, /set status = 'REOPENED'/);
  assert.doesNotMatch(barrier, /status[^\n]*in \('CLOSED','REOPENED'\)/i);
});

test("Night Audit API requires dedicated reopen permission and a correction reason", () => {
  assert.match(route, /action === "REOPEN" \? "hotel\.night_audit\.reopen"/);
  assert.match(route, /requiredPermission/);
  assert.match(route, /reason\.length < 8/);
  assert.match(route, /rpc\("hotel_reopen_business_day_guarded"/);
  assert.match(route, /action: "REOPEN"/);
});

test("Night Audit workboard exposes governed correction rather than a force-close bypass", () => {
  assert.match(page, /Governed correction/);
  assert.match(page, /Reopen current business day/);
  assert.match(page, /Historical days stay immutable/);
  assert.match(page, /reopenReason\.trim\(\)\.length < 8/);
  assert.doesNotMatch(page, /force-close/i);
});

test("correction table and reopen function are not browser writable", () => {
  assert.match(migration, /alter table public\.hotel_business_day_corrections enable row level security/);
  assert.match(migration, /revoke all on table public\.hotel_business_day_corrections from public, anon, authenticated/);
  const signature = "hotel_reopen_business_day_guarded(uuid,uuid,date,text,uuid)";
  assert.ok(migration.includes(`revoke all on function public.${signature} from public;`));
  assert.ok(migration.includes(`revoke all on function public.${signature} from anon;`));
  assert.ok(migration.includes(`revoke all on function public.${signature} from authenticated;`));
  assert.ok(migration.includes(`grant execute on function public.${signature} to service_role;`));
});
