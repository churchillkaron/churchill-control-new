import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260923053017_hotel_ota_evidence_privilege_hardening.sql",
  "utf8",
);

test("Hotel OTA evidence tables remain server-only with minimum privileges", () => {
  for (const table of [
    "hotel_channel_reservation_events",
    "hotel_channel_reservation_reconciliations",
    "hotel_channel_transmissions",
  ]) {
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`));
    assert.match(migration, new RegExp(`from public, anon, authenticated, service_role`));
  }
  assert.match(migration, /grant select, insert, update on table public\.hotel_channel_reservation_events/);
  assert.match(migration, /grant select, insert on table public\.hotel_channel_reservation_reconciliations/);
  assert.match(migration, /grant select, insert, update on table public\.hotel_channel_transmissions/);
  assert.doesNotMatch(migration, /grant delete|grant truncate|grant trigger/i);
});
