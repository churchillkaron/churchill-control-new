import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260924013440_local_compute_code_single_flight.sql", import.meta.url),
  "utf8",
);

test("local compute claims serialize decisions per physical node", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /hashtextextended\('avantiqo-local-claim:' \|\| btrim\(p_node_id\), 0\)/);
});

test("dedicated Code claims are single-flight even with duplicate worker processes", () => {
  assert.match(migration, /v_code_claim boolean := false/);
  assert.match(migration, /if v_code_claim then[\s\S]*v_limit := 1/);
  assert.match(migration, /j\.workload = 'code_text'[\s\S]*active\.workload = 'code_text'/);
  assert.match(migration, /active\.status = 'RUNNING'/);
  assert.match(migration, /active\.leased_until > now\(\)/);
});

test("single-flight keeps existing GPU exclusivity and dedicated-Code fallback semantics", () => {
  assert.match(migration, /and not v_code_lane_active/);
  assert.match(migration, /image_generate/);
  assert.match(migration, /video_ltx25/);
  assert.match(migration, /active\.workload = 'code_text'/);
  assert.match(migration, /revoke all on function public\.claim_avantiqo_local_compute_jobs/);
});
