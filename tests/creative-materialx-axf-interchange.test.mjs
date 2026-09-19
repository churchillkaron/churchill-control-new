import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeMaterialXInterchangeRuntime,
} from "../lib/creative/materials/runtime/CreativeMaterialXInterchangeRuntime.js";
import {
  CreativeAxfMaterialConversionRuntime,
} from "../lib/creative/materials/runtime/CreativeAxfMaterialConversionRuntime.js";

const XML = `<materialx version="1.38">
  <standard_surface name="carpaint" type="surfaceshader">
    <input name="base_color" type="color3" value="0.9, 0.2, 0.05"/>
    <input name="metalness" type="float" value="0.75"/>
    <input name="specular_roughness" type="float" value="0.18"/>
    <input name="specular_ior" type="float" value="1.52"/>
    <input name="coat" type="float" value="1"/>
    <input name="coat_roughness" type="float" value="0.055"/>
  </standard_surface>
</materialx>`;

test("MaterialX Standard Surface maps reproducible automotive PBR properties", () => {
  const result = CreativeMaterialXInterchangeRuntime.importStandardSurface({
    xml: XML,
    material_id: "paint",
    material_class: "AUTOMOTIVE_PAINT",
  });
  assert.equal(result.status, "READY");
  assert.equal(result.material.pbr.metallic, 0.75);
  assert.equal(result.material.pbr.roughness, 0.18);
  assert.equal(result.material.pbr.ior, 1.52);
  assert.equal(result.material.pbr.coat_weight, 1);
  assert.equal(result.material.material_interchange.source_checksum, result.source_checksum);
});test("MaterialX complex graphs require governed resource bindings instead of flattening", () => {
  const xml = `<materialx version="1.38"><nodegraph name="g"><image name="i" type="color3"><input name="file" type="filename" value="paint.exr"/></image><output name="out" type="color3" nodename="i"/></nodegraph><standard_surface name="s" type="surfaceshader"><input name="base_color" type="color3" nodegraph="g" output="out"/></standard_surface></materialx>`;
  assert.throws(
    () => CreativeMaterialXInterchangeRuntime.importStandardSurface({ xml }),
    /MATERIALX_GRAPH_RESOURCE_BINDING_REQUIRED:paint.exr/,
  );
});

test("MaterialX unsupported Standard Surface inputs fail closed", () => {
  const xml = `<materialx version="1.38"><standard_surface name="s" type="surfaceshader"><input name="thin_film_thickness" type="float" value="400"/></standard_surface></materialx>`;
  assert.throws(
    () => CreativeMaterialXInterchangeRuntime.importStandardSurface({ xml }),
    /MATERIALX_STANDARD_SURFACE_INPUT_UNSUPPORTED:thin_film_thickness/,
  );
});

test("AxF conversion requires durable converter, spectral and appearance evidence", () => {
  const blocked = CreativeAxfMaterialConversionRuntime.validate({
    source_axf_checksum: "a".repeat(64),
    converter_id: "vendor-converter",
    converter_version: "1.0",
    conversion_manifest_id: "manifest-1",
    conversion_manifest_checksum: "b".repeat(64),
    target_materialx_checksum: "c".repeat(64),
    actual_materialx_checksum: "c".repeat(64),
  });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.blockers.includes("AXF_SPECTRAL_CONVERSION_DOCUMENTATION_REQUIRED"));
  assert.ok(blocked.blockers.includes("AXF_APPEARANCE_VALIDATION_REQUIRED"));
});test("validated AxF conversion binds to exact MaterialX bytes without claiming native decode", () => {
  const materialX = CreativeMaterialXInterchangeRuntime.importStandardSurface({ xml: XML });
  const result = CreativeMaterialXInterchangeRuntime.importStandardSurface({
    xml: XML,
    material_id: "converted-paint",
    material_class: "AUTOMOTIVE_PAINT",
    axf_conversion: {
      source_axf_checksum: "a".repeat(64),
      converter_id: "certified-axf-to-materialx",
      converter_version: "2.1",
      conversion_manifest_id: "manifest-42",
      conversion_manifest_checksum: "b".repeat(64),
      target_materialx_checksum: materialX.source_checksum,
      spectral_conversion_documented: true,
      appearance_validation_passed: true,
    },
  });
  assert.equal(result.material.material_interchange.axf_conversion.status, "READY");
  assert.equal(result.material.material_interchange.axf_conversion.native_axf_decode_performed, false);
  assert.equal(result.native_materialx_in_usd_rendering_claimed, false);
});

test("AxF conversion rejects a MaterialX checksum mismatch", () => {
  assert.throws(() => CreativeMaterialXInterchangeRuntime.importStandardSurface({
    xml: XML,
    axf_conversion: {
      source_axf_checksum: "a".repeat(64),
      converter_id: "converter",
      converter_version: "1",
      conversion_manifest_id: "manifest",
      conversion_manifest_checksum: "b".repeat(64),
      target_materialx_checksum: "c".repeat(64),
      spectral_conversion_documented: true,
      appearance_validation_passed: true,
    },
  }), /AXF_MATERIALX_CHECKSUM_MISMATCH/);
});

test("Material Lab and Cycles preserve MaterialX interchange provenance", async () => {
  const fs = await import("node:fs");
  const lab = fs.readFileSync(
    "lib/creative/materials/runtime/CreativeMaterialLabRuntime.js",
    "utf8",
  );
  const binding = fs.readFileSync(
    "lib/creative/materials/runtime/CreativeMaterialInterchangeBindingRuntime.js",
    "utf8",
  );
  const cycles = fs.readFileSync(
    "lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js",
    "utf8",
  );
  assert.match(lab, /material_interchange:object\(r\.material_interchange\)/);
  assert.match(lab, /MATERIALX_SOURCE_CHECKSUM_REQUIRED/);
  assert.match(binding, /materialx_asset_node_id/);
  assert.match(binding, /CreativeMaterialXInterchangeRuntime\.importStandardSurface/);
  assert.match(cycles, /CreativeMaterialInterchangeBindingRuntime\.resolve/);
  assert.match(cycles, /materialx_material_count/);
});
