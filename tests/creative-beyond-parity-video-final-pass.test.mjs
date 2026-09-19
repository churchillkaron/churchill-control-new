import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { CreativeMaterialXInterchangeRuntime } from
  "../lib/creative/materials/runtime/CreativeMaterialXInterchangeRuntime.js";
import { CreativeNativeAxfSdkRuntime } from
  "../lib/creative/materials/runtime/CreativeNativeAxfSdkRuntime.js";
import { CreativeMultiCameraStereoVirtualProductionRuntime } from
  "../lib/creative/rendering/runtime/CreativeMultiCameraStereoVirtualProductionRuntime.js";
import { CreativeBeyondParityVideoCertificationRuntime } from
  "../lib/creative/certification/runtime/CreativeBeyondParityVideoCertificationRuntime.js";

const cycles = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeCyclesProductionRenderRuntime.js",
  "utf8",
);
const ui = fs.readFileSync(
  "components/creative/ProductionStudio/workspaces/RenderWorkspaceV5.jsx",
  "utf8",
);
const openvdb = fs.readFileSync(
  "lib/creative/rendering/runtime/CreativeOpenVdbUsdVolumeRuntime.js",
  "utf8",
);
const GRAPH_XML = `<materialx version="1.38">
  <nodegraph name="NG">
    <constant name="a" type="color3" value="0.8,0.1,0.02"/>
    <constant name="b" type="color3" value="0.5,0.5,0.5"/>
    <multiply name="mul" type="color3">
      <input name="in1" type="color3" nodename="a"/>
      <input name="in2" type="color3" nodename="b"/>
    </multiply>
    <output name="out" type="color3" nodename="mul"/>
  </nodegraph>
  <standard_surface name="paint" type="surfaceshader">
    <input name="base_color" type="color3" nodegraph="NG" output="out"/>
    <input name="coat" type="float" value="1"/>
  </standard_surface>
</materialx>`;

test("complex MaterialX nodegraph translates through nodegraph output and reaches Cycles", () => {
  const result = CreativeMaterialXInterchangeRuntime.importStandardSurface({
    xml: GRAPH_XML,
    material_id: "graph-paint",
    material_class: "AUTOMOTIVE_PAINT",
  });
  assert.equal(result.status, "READY");
  assert.equal(result.materialx_graph_translated, true);
  assert.equal(result.material.material_graph.status, "READY");
  assert.deepEqual(result.material.material_graph.execution_order, ["a", "b", "mul"]);
  assert.equal(result.material.material_graph.surface_bindings[0].node, "mul");
  assert.match(cycles, /AVANTIQO_MATERIALX_GRAPH_TRANSLATION_V1/);
  assert.match(cycles, /ShaderNodeMixRGB/);
});
test("native AxF SDK path requires licensed authority and proves actual native decode", async () => {
  const authority = CreativeNativeAxfSdkRuntime.authorize({
    sdk_vendor: "X-RITE",
    sdk_version: "test-sdk-1",
    platform: "LINUX",
    license_fingerprint: "a".repeat(64),
    bridge_id: "axf-bridge",
    bridge_checksum: "b".repeat(64),
  });
  assert.equal(authority.status, "READY");

  const source = Buffer.from("AXF-NATIVE-TEST");
  const result = await CreativeNativeAxfSdkRuntime.decode({
    source_buffer: source,
    sdk_authority: authority,
    execute_sdk: async ({ source_checksum }) => ({
      native_decode_performed: true,
      source_checksum,
      representation: "CARPAINT",
      materials: [{ material_id: "paint", pbr: { coat_weight: 1 } }],
      spectral_data_preserved: true,
      appearance_metadata_preserved: true,
    }),
  });
  assert.equal(result.status, "READY");
  assert.equal(result.native_axf_decode_claimed, true);
  assert.equal(result.representation, "CARPAINT");
  assert.match(result.decode_evidence_hash, /^[a-f0-9]{64}$/);
});
test("OpenVDB USD authoring uses Volume and OpenVDBAsset schema", () => {
  assert.match(openvdb, /def Volume/);
  assert.match(openvdb, /def OpenVDBAsset/);
  assert.match(openvdb, /field:/);
  assert.match(openvdb, /asset filePath/);
  assert.match(cycles, /bpy\.data\.volumes\.load/);
  assert.match(cycles, /ShaderNodeVolumePrincipled/);
});

test("multi-camera stereo and virtual production require sync, calibration and tracking samples", () => {
  const matrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
  const result = CreativeMultiCameraStereoVirtualProductionRuntime.author({
    cameras: [
      { id: "hero", location: [0,-5,2], look_at: [0,0,1], lens_mm: 35 },
      { id: "detail", location: [2,-3,1], look_at: [0,0,1], lens_mm: 85 },
    ],
    sync: {
      timecode_format: "SMPTE_24",
      start_timecode: "01:00:00:00",
      genlock_verified: true,
      sync_reference_id: "genlock-a",
    },
    stereo: {
      enabled: true,
      camera_id: "hero",
      interocular_distance_m: 0.065,
      convergence_distance_m: 8,
      convergence_mode: "OFFAXIS",
    },
    virtual_production: {
      enabled: true,
      led_wall_id: "wall-a",
      frustum_camera_id: "hero",
      camera_tracking_latency_ms: 12,
      tracking_calibration_hash: "track-cal",
      display_calibration_hash: "display-cal",
      color_pipeline_hash: "color-pipeline",
      wall_refresh_hz: 60,
      display_geometry: { width_m: 12, height_m: 5, resolution_x: 7680, resolution_y: 2160 },
      tracking_samples: [{ frame: 1, timecode: "01:00:00:00", camera_id: "hero", transform_matrix: matrix }],
    },
  });
  assert.equal(result.status, "READY");
  assert.deepEqual(result.render_plan[0].stereo_views, ["LEFT", "RIGHT"]);
  assert.equal(result.render_plan[0].frustum_driver, true);
  assert.match(cycles, /scene\.render\.use_multiview/);
  assert.match(cycles, /interocular_distance/);
});
test("beyond-parity certification keeps licensed AxF distinct from implementation-only evidence", () => {
  const report = CreativeBeyondParityVideoCertificationRuntime.certify({
    evidence: {
      COMPLEX_MATERIALX_GRAPH_TRANSLATION: {
        contract: "AVANTIQO_MATERIALX_GRAPH_TRANSLATION_V1",
        status: "READY",
        technical_proof_passed: true,
        graph_hash: "graph",
        cycles_graph_execution_verified: true,
      },
      NATIVE_AXF_SDK_INGEST: {
        contract: "AVANTIQO_NATIVE_AXF_SDK_INGEST_V1",
        status: "READY",
        technical_proof_passed: true,
        native_axf_decode_performed: false,
        native_axf_decode_claimed: false,
      },
      OPENVDB_USD_VOLUMETRIC_WORKFLOWS: {
        contract: "AVANTIQO_OPENVDB_USD_VOLUME_WORKFLOW_V1",
        status: "READY",
        technical_proof_passed: true,
        openvdb_native_assets: true,
        usd_volume_schema_authored: true,
        cycles_volume_execution_verified: true,
      },
      MULTICAMERA_STEREO_VIRTUAL_PRODUCTION: {
        contract: "AVANTIQO_MULTICAMERA_STEREO_VIRTUAL_PRODUCTION_V1",
        status: "READY",
        technical_proof_passed: true,
        workflow_hash: "workflow",
        multicamera_render_verified: true,
        stereo_multiview_verified: true,
        virtual_production_verified: true,
      },
    },
  });
  assert.equal(report.certified, false);
  assert.deepEqual(report.blocked_upgrade_ids, ["NATIVE_AXF_SDK_INGEST"]);
});

test("Video Studio exposes the final beyond-parity systems", () => {
  assert.match(ui, /MaterialX Graph/);
  assert.match(ui, /Native AxF/);
  assert.match(ui, /OpenVDB \+ USD volumes/);
  assert.match(ui, /Multi-cam \/ stereo \/ LED frustum/);
});
