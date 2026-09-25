import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260925101500_minimize_local_compute_heartbeat_lock.sql", "utf8");

test("local compute heartbeat avoids a pre-read FOR UPDATE lock", () => {
  assert.match(migration, /create or replace function public\.heartbeat_avantiqo_local_compute_node/);
  assert.doesNotMatch(migration, /for update/i);
  assert.match(migration, /coalesce\(metadata->'lane_attestations'/);
  assert.match(migration, /v_lane_patch/);
  assert.match(migration, /update public\.avantiqo_local_compute_nodes/);
});
