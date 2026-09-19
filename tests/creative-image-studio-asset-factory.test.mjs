import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CreativeImageAssetAuthorityRuntime,
} from "../lib/creative/image/runtime/CreativeImageAssetAuthorityRuntime.js";
import {
  CreativeImageAssetHandoffRuntime,
} from "../lib/creative/image/runtime/CreativeImageAssetHandoffRuntime.js";

const graph = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js", "utf8");
const reconcile = fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetReconciliationRuntime.js", "utf8");
const productionGraph = fs.readFileSync("lib/creative/production-graph/runtime/ProductionGraphRuntime.js", "utf8");
const queue = fs.readFileSync("lib/creative/production/queue/runtime/ProductionQueueRuntime.js", "utf8");
const gate = fs.readFileSync("lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate.js", "utf8");
const premium = fs.readFileSync("lib/creative/vfx/runtime/CreativePremiumLayerTaskMaterializationRuntime.js", "utf8");

test("image asset authority declares downstream production roles", () => {
  const authority = CreativeImageAssetAuthorityRuntime.build({
    asset_class: "VFX_SOURCE",
    scene_id: "scene-1",
    shot_id: "shot-2",
    continuity_group_id: "continuity:scene-1",
    downstream_roles: ["video","vfx","compositing"],
    approved_for_video_source: true,
    approved_for_vfx_source: true,
    approved_for_compositing_source: true,
  });
  assert.equal(authority.asset_class, "VFX_SOURCE");
  assert.equal(authority.approved_for_vfx_source, true);
  assert.equal(authority.provider_selection_owner, "SERVICE_RUNTIME");
});

test("image studio graph generates governed production asset classes", () => {
  assert.match(graph, /CHARACTER_SHEET/);
  assert.match(graph, /HERO_FRAME/);
  assert.match(graph, /THREAT_DESIGN/);
  assert.match(graph, /ENVIRONMENT_LOOKFRAME/);
  assert.match(graph, /TRANSITION_LOOKFRAME/);
  assert.match(graph, /VFX_SOURCE/);
  assert.match(graph, /COMPOSITING_SOURCE/);
  assert.match(graph, /provider:null/);
  assert.match(graph, /reject_before_motion_generation:true/);
});

test("image studio assets enter temporal graph before perceptual review", () => {
  assert.match(productionGraph, /CreativeImageAssetGraphRuntime/);
  assert.match(productionGraph, /graph: imageAssetGraph/);
});

test("premium image asset review rejects generic AI source material", () => {
  assert.match(gate, /IMAGE STUDIO ASSET REVIEW/);
  assert.match(gate, /generic AI beauty/);
  assert.match(gate, /CHARACTER_SHEET/);
  assert.match(gate, /THREAT_DESIGN/);
  assert.match(gate, /TRANSITION_LOOKFRAME/);
  assert.match(gate, /clean stable geometry/);
});

test("approved image assets persist with downstream authority", () => {
  assert.match(reconcile, /approved_for_video_source/);
  assert.match(reconcile, /approved_for_vfx_source/);
  assert.match(reconcile, /approved_for_compositing_source/);
  assert.match(reconcile, /image_asset_perceptual_qc_sealed:true/);
  assert.match(queue, /CreativeImageAssetReconciliationRuntime/);
});

test("handoff selects only QC-approved assets for declared role", () => {
  const asset = {
    id: "img-1",
    status: "APPROVED",
    url: "storage://bucket/img.png",
    review: { approved: true },
    metadata: {
      image_asset_class: "VFX_SOURCE",
      image_asset_perceptual_qc_sealed: true,
      image_asset_pack_qc_sealed: true,
      release_approved: true,
      approved_for_vfx_source: true,
      image_asset_authority: {
        asset_class: "VFX_SOURCE",
        scene_id: "scene-1",
        shot_id: "shot-1",
        continuity_group_id: "continuity:scene-1",
      },
    },
  };
  const selected = CreativeImageAssetHandoffRuntime.select({
    asset_nodes: [asset],
    scene_id: "scene-1",
    shot_id: "shot-1",
    continuity_group_id: "continuity:scene-1",
    asset_classes: ["VFX_SOURCE"],
    downstream_role: "VFX",
  });
  assert.equal(selected.selected?.id, "img-1");
});

test("threat hero execution consumes Image Studio governed VFX assets", () => {
  assert.match(premium, /CreativeImageAssetHandoffRuntime/);
  assert.match(premium, /asset_classes:\["VFX_SOURCE","THREAT_DESIGN"\]/);
  assert.match(premium, /downstream_role:"VFX"/);
});
