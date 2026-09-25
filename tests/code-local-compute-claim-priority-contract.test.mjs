import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/20260925130242_local_compute_code_text_claim_priority.sql", "utf8");

test("shared GPU deep/fast text yields to executable Code while media and front/live remain available", () => {
  assert.match(migration, /j\.workload = 'intelligence_text'/);
  assert.match(migration, /j\.lane in \('fast','deep'\)/);
  assert.match(migration, /and not v_code_claim/);
  assert.match(migration, /and v_code_lane_fresh/);
  assert.match(migration, /waiting_code\.workload = 'code_text'/);
  assert.doesNotMatch(migration, /j\.workload in \([\s\S]{0,240}'image_generate'[\s\S]{0,300}and not v_code_claim/);
  assert.match(migration, /AVANTIQO_LOCAL_NODE_UNAUTHORIZED/);
  assert.match(migration, /pg_advisory_xact_lock/);
});
