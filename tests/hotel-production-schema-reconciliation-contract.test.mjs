import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260923051541_hotel_production_schema_reconciliation.sql",
  "utf8",
);

test("production Hotel reconciliation is additive and supplies current runtime columns", () => {
  for (const column of ["first_name", "last_name", "passport_number", "date_of_birth"]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}`));
  }
  assert.match(migration, /add column if not exists booking_id uuid references public\.hotel_bookings/);
  assert.match(migration, /add column if not exists task_type text/);
  assert.match(migration, /when room_id is null then 'GENERAL'/);
  assert.match(migration, /else 'CLEANING'/);
  assert.match(migration, /alter column task_type set not null/);
  assert.match(migration, /hotel_housekeeping_tasks_booking_type_idx/);
  assert.doesNotMatch(migration, /drop table|drop column|alter column .* type/i);
});
