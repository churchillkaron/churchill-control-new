import test from "node:test";
import assert from "node:assert/strict";

import { CreativeShotAssetScopeRuntime } from "../lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime.js";

test("approval-record asset node ids are governance metadata, not provider media scope", () => {
  assert.equal(CreativeShotAssetScopeRuntime.assetNodeKey("asset_node_id"), true);
  assert.equal(CreativeShotAssetScopeRuntime.assetNodeKey("source_asset_node_id"), true);
  assert.equal(CreativeShotAssetScopeRuntime.assetNodeKey("approval_record_asset_node_id"), false);
  assert.equal(CreativeShotAssetScopeRuntime.assetNodeKey("production_dossier_approval_record_asset_node_id"), false);
});

test("scope builder excludes approval-record governance ids while retaining real asset nodes", () => {
  const scope = CreativeShotAssetScopeRuntime.build({
    node: {
      id: "shot-1",
      assets: [],
      requirements: {
        asset_node_id: "media-node-1",
        production_dossier_approval_record_asset_node_id: "approval-node-1",
      },
    },
    graph_nodes: [{ id: "shot-1" }],
    edges: [],
    project_asset_ids: [],
  });
  assert.deepEqual(scope.asset_node_ids, ["media-node-1"]);
  assert.equal(scope.asset_node_ids.includes("approval-node-1"), false);
});
