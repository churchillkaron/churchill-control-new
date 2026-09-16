import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile("scripts/plan-avantiqo-music-sfx-promotion.mjs", "utf8");
test("SFX promotion requires benchmark economics and human quality evidence", () => {
  assert.match(source, /benchmark_certified/);
  assert.match(source, /economics_certified/);
  assert.match(source, /human_quality_certified/);
  assert.match(source, /model_license_verified/);
});
test("SFX promotion is plan-only and cannot auto-activate", () => {
  assert.match(source, /mode:\s*"PLAN_ONLY"/);
  assert.match(source, /automatic_activation_forbidden:true/);
  assert.match(source, /pricing_mutation_performed:false/);
  assert.match(source, /production_routing_mutation_performed:false/);
  assert.match(source, /production_deployment_performed:false/);
});
