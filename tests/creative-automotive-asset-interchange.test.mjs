import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CreativeAutomotiveAssetInterchangeRuntime,
} from "../lib/creative/rendering/runtime/CreativeAutomotiveAssetInterchangeRuntime.js";

const binding = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeModelAssetBindingRuntime.js",
  "utf8",
);
const cycles = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js",
  "utf8",
);

function valid(overrides = {}) {
  return {
    interchange_format: "USD",
    source_cad_format: "STEP",
    source_asset_checksum: "sha256-source",
    conversion_manifest_id: "cad-to-usd:1",
    meters_per_unit: 1,
    up_axis: "Z_UP",
    part_hierarchy_preserved: true,
    material_assignments_preserved: true,
    normals_validated: true,
    uvs_validated: true,
    wheel_pivots_validated: true,
    vehicle_dimensions_validated: true,
    named_part_groups: ["body", "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr"],
    ...overrides,
  };
}

test("automotive interchange accepts physical USD with CAD provenance", () => {
  const result = CreativeAutomotiveAssetInterchangeRuntime.evaluate(valid());
  assert.equal(result.status, "READY");
  assert.deepEqual(result.blockers, []);
  assert.equal(result.interchange_format, "USD");
  assert.equal(result.source_cad_format, "STEP");
  assert.ok(result.interchange_hash);
});

test("automotive interchange fails closed on bad scale and missing hierarchy", () => {
  const result = CreativeAutomotiveAssetInterchangeRuntime.evaluate(valid({
    meters_per_unit: 0.01,
    part_hierarchy_preserved: false,
  }));
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blockers.includes("AUTOMOTIVE_METERS_PER_UNIT_MUST_EQUAL_1"));
  assert.ok(result.blockers.includes("AUTOMOTIVE_PART_HIERARCHY_REQUIRED"));
});
test("model binding and Cycles accept USD and Alembic interchange", () => {
  for (const extension of ["usd", "usda", "usdc", "abc"]) {
    assert.match(binding, new RegExp(`"${extension}"`));
  }
  assert.match(cycles, /usd_import/);
  assert.match(cycles, /alembic_import/);
});

test("automotive model binding cannot bypass the interchange authority", () => {
  assert.match(binding, /CreativeAutomotiveAssetInterchangeRuntime\.evaluate/);
  assert.match(binding, /AUTOMOTIVE_MODEL_ASSET_BLOCKED/);
  assert.match(binding, /automotive_interchange_hash/);
});
