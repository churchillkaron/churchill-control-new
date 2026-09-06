import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const barrier = fs.readFileSync("supabase/migrations/20260906161000_hotel_business_day_write_barrier.sql", "utf8");
const nightAudit = fs.readFileSync("app/api/hotel/night-audit/route.js", "utf8");
const atomicCheckout = fs.readFileSync("supabase/migrations/20260906154800_hotel_atomic_checkout_transition.sql", "utf8");
const transition = fs.readFileSync("lib/hotel/server/transitionHotelBooking.js", "utf8");

test("Hotel business date is derived from the same explicit property settings at server and database boundaries", () => {
  assert.match(barrier, /hotel_business_date_from_settings/);
  assert.match(barrier, /p_time_zone text/);
  assert.match(barrier, /p_cutoff_minutes integer/);
  assert.match(barrier, /p_configured_at timestamptz/);
  assert.match(barrier, /pg_timezone_names/);
  assert.match(barrier, /v_minutes < p_cutoff_minutes/);
  assert.match(barrier, /HOTEL_BUSINESS_DAY_UNCONFIGURED/);
});

test("Day Close and current-day Hotel writes share one transaction-scoped property-day lock", () => {
  assert.match(barrier, /pg_advisory_xact_lock/);
  assert.match(barrier, /hotel-business-day:/);
  assert.match(barrier, /create or replace function public\.hotel_assert_business_day_open/);
  assert.match(barrier, /perform public\.hotel_lock_business_day\(p_organization_id, p_property_id, p_business_date\)/);
  assert.match(barrier, /HOTEL_BUSINESS_DAY_CLOSED/);
  assert.match(barrier, /create trigger hotel_bookings_business_day_barrier/);
  assert.match(barrier, /create trigger hotel_folios_business_day_barrier/);
  assert.match(barrier, /create trigger hotel_properties_operational_day_barrier/);
});

test("booking barrier protects only source truth that can change the current Day Close decision", () => {
  assert.match(barrier, /upper\(coalesce\(new\.status, ''\)\) = 'RESERVED'[\s\S]*new\.check_in_date <= v_business_date/);
  assert.match(barrier, /upper\(coalesce\(new\.status, ''\)\) = 'CHECKED_IN'[\s\S]*new\.check_out_date <= v_business_date/);
  assert.match(barrier, /upper\(coalesce\(new\.status, ''\)\) = 'CHECKED_OUT'[\s\S]*actual_check_out_business_date/);
  assert.doesNotMatch(barrier, /new\.check_in_date > v_business_date[\s\S]*hotel_assert_business_day_open/);
  assert.match(barrier, /actual checkout business date does not match the governed property day/);
});

test("Day Close revalidates source truth after obtaining the same write barrier", () => {
  const closeStart = barrier.indexOf("create or replace function public.hotel_close_business_day_guarded");
  assert.ok(closeStart >= 0);
  const close = barrier.slice(closeStart);

  const lock = close.indexOf("perform public.hotel_lock_business_day");
  const reread = close.indexOf("v_locked_business_date := public.hotel_current_business_date_guarded");
  const arrivals = close.indexOf("select count(*) into v_overdue_arrivals");
  const departures = close.indexOf("select count(*) into v_overdue_departures");
  const folios = close.indexOf("select count(*) into v_open_departure_folios");
  const auditWrite = close.indexOf("insert into public.hotel_night_audits");

  assert.ok(lock >= 0 && lock < reread);
  assert.ok(reread < arrivals);
  assert.ok(arrivals < departures && departures < folios && folios < auditWrite);
  assert.match(close, /HOTEL_DAY_CLOSE_BLOCKED/);
  assert.match(close, /closed_under_business_day_lock/);
});

test("Night Audit API cannot bypass guarded Day Close authority", () => {
  assert.match(nightAudit, /rpc\("hotel_close_business_day_guarded"/);
  assert.match(nightAudit, /p_expected_business_date: operationalDate\.businessDate/);
  assert.match(nightAudit, /p_closed_by_staff_account_id: access\.access\?\.staffAccountId \|\| null/);
  assert.doesNotMatch(nightAudit, /from\("hotel_night_audits"\)\.upsert/);
  assert.match(nightAudit, /isGuardedCloseConflict/);
  assert.match(nightAudit, /refreshedCloseBlockers/);
  assert.ok(nightAudit.indexOf('rpc("hotel_close_business_day_guarded"') < nightAudit.indexOf('source: "night-audit"'));
});

test("atomic checkout automatically participates through the booking barrier and preserves governed checkout evidence", () => {
  assert.match(atomicCheckout, /update public\.hotel_bookings/);
  assert.match(atomicCheckout, /actual_check_out_business_date = p_business_date/);
  assert.match(transition, /rpc\(\s*"hotel_check_out_booking_guarded"/);
  assert.match(barrier, /before insert or update or delete on public\.hotel_bookings/);
});

test("write-barrier and Day Close functions are not browser-callable", () => {
  for (const signature of [
    "hotel_current_business_date_guarded(uuid, uuid, timestamptz)",
    "hotel_lock_business_day(uuid, uuid, date)",
    "hotel_assert_business_day_open(uuid, uuid, date)",
    "hotel_close_business_day_guarded(uuid, uuid, date, jsonb, uuid)",
  ]) {
    const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(barrier, new RegExp(`revoke all on function public\\.${escaped} from authenticated`));
    assert.match(barrier, new RegExp(`grant execute on function public\\.${escaped} to service_role`));
  }
});
