import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildCreativeStillPrevisualizationBlueprint,
} from "../lib/creative/stills/runtime/CreativeStillPrevisualizationRuntime.js";
import {
  buildCreativeStillProductionAuthority,
  verifyCreativeStillProductionAuthority,
} from "../lib/creative/stills/runtime/CreativeStillProductionAuthorityRuntime.js";

function blueprint() {
  return buildCreativeStillPrevisualizationBlueprint({
    deliverable: { id: "poster", type: "POSTER" },
    step: { id: "hero", capability: "ai.image.generate" },
    output_spec: { width: 1080, height: 1350 },
    requirements: { expected_contract: { brand_expected: true } },
  });
}

test("still production authority binds previs, exact design, dailies and repair-first policy", () => {
  const previs = blueprint();
  const authority = buildCreativeStillProductionAuthority({
    previsualization: previs,
    requirements: { expected_contract: { brand_expected: true, identity_expected: true } },
    reference_assets: [{ asset_id: "cole-reference" }, { asset_id: "brand-logo" }],
    capability: "ai.image.generate",
    deliverable: { id: "poster", type: "POSTER" },
  });

  assert.equal(authority.passed, true);
  assert.equal(authority.payload.previsualization_digest, previs.blueprint_digest);
  assert.equal(authority.payload.exact_design.generated_text_pixels_forbidden, true);
  assert.equal(authority.payload.quality_authority.intended_vs_rendered_dailies_required, true);
  assert.equal(authority.payload.repair_authority.bounded_repair_before_regeneration, true);
  assert.equal(authority.payload.execution_boundary.provider_execution_authority, false);
  assert.equal(verifyCreativeStillProductionAuthority(authority, previs), true);
});

test("still production authority fails closed when required reference evidence is absent", () => {
  const previs = blueprint();
  const authority = buildCreativeStillProductionAuthority({
    previsualization: previs,
    requirements: { expected_contract: { identity_expected: true } },
    capability: "ai.image.generate",
  });

  assert.equal(authority.passed, false);
  assert.ok(authority.failures.includes("STILL_AUTHORITY_REFERENCE_EVIDENCE_REQUIRED"));
  assert.equal(verifyCreativeStillProductionAuthority(authority, previs), false);
});

test("still production authority digest detects mutation", () => {
  const previs = blueprint();
  const authority = buildCreativeStillProductionAuthority({
    previsualization: previs,
    reference_assets: [{ asset_id: "brand-logo" }],
    capability: "ai.image.generate",
  });
  assert.equal(authority.passed, true);
  const mutated = structuredClone(authority);
  mutated.payload.quality_authority.overall_floor = 70;
  assert.equal(verifyCreativeStillProductionAuthority(mutated, previs), false);
});

test("planner and execution runtime enforce still production authority", () => {
  const graph = fs.readFileSync("lib/creative/production-graph/planner/UniversalProductionGraphPlanner.js", "utf8");
  const taskRuntime = fs.readFileSync("lib/operations/tasks/runtime/ProductionTaskRuntime.js", "utf8");
  assert.ok(graph.includes("buildCreativeStillProductionAuthority"));
  assert.ok(graph.includes("still_production_authority"));
  assert.ok(taskRuntime.includes("verifyCreativeStillProductionAuthority"));
  assert.ok(taskRuntime.includes("STUDIO_STILL_PRODUCTION_AUTHORITY_REQUIRED"));
});

test("still production authority requires an exact brand asset for deterministic logo composition", () => {
  const previs = blueprint();
  const authority = buildCreativeStillProductionAuthority({
    previsualization: previs,
    requirements: { expected_contract: { brand_expected: true } },
    capability: "ai.image.generate",
  });
  assert.equal(authority.passed, false);
  assert.ok(authority.failures.includes("STILL_AUTHORITY_EXACT_BRAND_ASSET_REQUIRED"));
});
