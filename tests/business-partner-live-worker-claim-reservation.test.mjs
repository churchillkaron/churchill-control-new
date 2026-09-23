import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260923084556_reserve_business_partner_front_lane_for_live_worker.sql",
  "utf8",
);

test("front ai.text.generate is reserved for the existing live worker", () => {
  assert.match(migration, /v_live_claimer boolean := false/);
  assert.match(migration, /'ai\.code\.live-conversation' = any\(coalesce\(p_capabilities/);
  assert.match(migration, /j\.lane = 'front' and j\.capability = 'ai\.text\.generate' and v_live_claimer/);
});

test("generic workers are excluded from front ai.text.generate while retaining normal capabilities", () => {
  assert.match(migration, /not \(j\.lane = 'front' and j\.capability = 'ai\.text\.generate'\)/);
  assert.match(migration, /j\.capability in \(select capability from allowed\)/);
  assert.match(migration, /order by j\.priority desc, j\.created_at asc/);
});
