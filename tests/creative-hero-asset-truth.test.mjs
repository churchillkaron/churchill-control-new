import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { creativeHeroAssetTruthFailures } from "../lib/creative/quality/runtime/CreativeHeroAssetTruthRuntime.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("exact geometry cannot be claimed from research-only references", () => {
  const failures = creativeHeroAssetTruthFailures({
    hero_asset_truth: {
      mode: "REFERENCE_GROUNDED_CLASS",
      exact_geometry_claimed: true,
      limitations: ["No manufacturer CAD or exact source geometry is available."],
    },
  });
  assert.ok(failures.includes("SHOT_HERO_ASSET_EXACT_GEOMETRY_CLAIM_FORBIDDEN"));
});

test("source-locked exact hero requires a real reference asset id", () => {
  const failures = creativeHeroAssetTruthFailures({
    hero_asset_truth: { mode: "SOURCE_LOCKED_EXACT", exact_geometry_claimed: true, reference_asset_ids: [] },
  });
  assert.ok(failures.includes("SHOT_HERO_ASSET_EXACT_REFERENCE_REQUIRED"));
});
test("research-grounded class fidelity is allowed when limitations are explicit", () => {
  const failures = creativeHeroAssetTruthFailures({
    hero_asset_truth: {
      mode: "REFERENCE_GROUNDED_CLASS",
      exact_geometry_claimed: false,
      limitations: ["Synthetic depiction must match visible class/configuration but is not manufacturer CAD."],
    },
  });
  assert.deepEqual(failures, []);
});

test("hero asset truth survives Director to previs to production graph", () => {
  const director = read("lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js");
  const validator = read("lib/creative/director/validation/CreativeMasterPlanValidator.js");
  const previs = read("lib/creative/quality/runtime/CreativeShotPrevisualizationBlueprintRuntime.js");
  const planner = read("lib/creative/production-graph/planner/ProductionGraphPlanner.js");
  assert.match(director, /SOURCE_LOCKED_EXACT\|REFERENCE_GROUNDED_CLASS\|ORIGINAL_SYNTHETIC\|NOT_APPLICABLE/);
  assert.match(validator, /creativeHeroAssetTruthFailures\(shot\)/);
  assert.match(previs, /hero_asset_truth: object\(shot\.hero_asset_truth\)/);
  assert.match(planner, /hero_asset_truth: shot\.hero_asset_truth \|\| \{\}/);
});
