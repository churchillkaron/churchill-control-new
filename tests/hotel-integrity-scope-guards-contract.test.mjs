import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260923052734_hotel_integrity_scope_guards.sql",
  "utf8",
);

test("Hotel Party, Finance and payment scope guards are canonical and server-only", () => {
  for (const fn of [
    "hotel_validate_guest_party_scope",
    "hotel_validate_property_finance_scope",
    "hotel_validate_payment_transaction_scope",
    "hotel_link_guest_party_guarded",
  ]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
  }

  assert.match(migration, /security invoker/);
  assert.match(migration, /HOTEL_GUEST_PARTY_SCOPE: party must belong to guest organization/);
  assert.match(migration, /HOTEL_FINANCE_SCOPE: legal entity must be active in property organization/);
  assert.match(migration, /HOTEL_PAYMENT_SCOPE: booking\/property\/guest mismatch/);
  assert.match(migration, /HOTEL_PAYMENT_SCOPE: settlement account mismatch/);

  assert.match(migration, /drop trigger if exists hotel_guests_party_scope_guard/);
  assert.match(migration, /drop trigger if exists hotel_properties_finance_scope_guard/);
  assert.match(migration, /drop trigger if exists hotel_payment_transactions_scope_guard/);

  assert.match(migration, /revoke all on function public\.hotel_validate_guest_party_scope\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.hotel_validate_property_finance_scope\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.hotel_validate_payment_transaction_scope\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.hotel_link_guest_party_guarded\(uuid, uuid\) from public, anon, authenticated/);

  assert.doesNotMatch(migration, /security definer/i);
});
