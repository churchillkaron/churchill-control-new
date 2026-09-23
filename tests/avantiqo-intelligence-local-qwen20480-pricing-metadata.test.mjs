import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260920104500_avantiqo_local_qwen4b_20480_context_metadata.sql", "utf8");

test("forward metadata migration records the measured Node01 20k envelope without activating production", () => {
  assert.match(migration, /local_context_tokens', 20480/);
  assert.match(migration, /local_deep_output_cap_tokens', 8192/);
  assert.match(migration, /single_pass_trusted_prompt_tokens', 6000/);
  assert.match(migration, /hierarchical_local_reasoning_supported', true/);
  assert.match(migration, /hierarchical_trigger_prompt_tokens', 6000/);
  assert.match(migration, /hierarchical_max_chunks', 12/);
  assert.match(migration, /NODE01_RTX2060_QWEN4B_20480_CONTEXT_HIERARCHICAL_DEEP_PASS/);
  assert.match(migration, /production_routing_allowed', false/);
  assert.match(migration, /production_certified', false/);
  assert.doesNotMatch(migration, /active\s*=\s*true/i);
  assert.doesNotMatch(migration, /input_cost_per_1m|output_cost_per_1m|cost_per_unit/);
});
