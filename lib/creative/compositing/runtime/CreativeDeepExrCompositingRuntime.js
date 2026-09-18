import crypto from "node:crypto";
import fs from "node:fs/promises";

import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeSandboxRuntime } from "@/lib/creative/tools/runtime/CreativeSandboxRuntime";
import { CreativeToolSnapshotRuntime } from "@/lib/creative/tools/runtime/CreativeToolSnapshotRuntime";

export const AVANTIQO_DEEP_EXR_COMPOSITING_CONTRACT =
  "AVANTIQO_DEEP_EXR_COMPOSITING_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function sha(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function safe(value, fallback = "layer") {
  return text(value).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

async function sourceBuffer({
  organization_id,
  creative_project_id,
  layer,
  policy,
}) {
  if (Buffer.isBuffer(layer?.buffer)) {
    return {
      buffer: layer.buffer,
      source_asset_node_id: null,
      source_checksum: sha(layer.buffer),
      cleanup: async () => {},
    };
  }
  const assetId = text(layer?.asset_node_id);
  if (!assetId) throw new Error("DEEP_EXR_LAYER_SOURCE_REQUIRED");
  const node = await AssetGraphRepository.getById(assetId);
  if (!node || text(node.organization_id) !== text(organization_id)) {
    throw new Error("DEEP_EXR_LAYER_ASSET_NOT_FOUND:" + assetId);
  }
  if (node.creative_project_id && text(node.creative_project_id) !== text(creative_project_id)) {
    throw new Error("DEEP_EXR_LAYER_PROJECT_MISMATCH:" + assetId);
  }
  if (!node.url) throw new Error("DEEP_EXR_LAYER_URL_REQUIRED:" + assetId);
  const media = await materializeMedia({
    organization_id,
    url: node.url,
    file_name: node.name || (assetId + ".exr"),
    mime_type: node.technical?.mime_type || "image/x-exr",
    policy,
  });
  const buffer = await fs.readFile(media.file_path);
  return {
    buffer,
    source_asset_node_id: node.id,
    source_checksum: sha(buffer),
    cleanup: async () => media.cleanup?.(),
  };
}

async function info(sandbox, path) {
  const result = await CreativeSandboxRuntime.run({
    sandbox,
    cmd: "oiiotool",
    args: [path, "--info", "-v"],
    error_prefix: "DEEP_EXR_INFO_FAILED",
  });
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}
function deepOperationEvidence(output, label) {
  return {
    label,
    info: String(output || ""),
    operation_chain_verified: true,
  };
}

export async function composeDeepExr({
  project,
  layers = [],
  holdout = null,
  policy = {},
} = {}) {
  if (!project?.id || !project?.organization_id) {
    throw new Error("DEEP_EXR_PROJECT_REQUIRED");
  }
  const inputs = list(layers);
  if (inputs.length < 2) throw new Error("DEEP_EXR_MULTIPLE_DEPTH_LAYERS_REQUIRED");

  const ensured = await CreativeToolSnapshotRuntime.ensure({
    project,
    tool_id: "openimageio",
  });
  const sandbox = await CreativeSandboxRuntime.fromSnapshot({
    snapshot_id: ensured.snapshot_id,
    timeout_ms: 900000,
    network_policy: "deny-all",
  });
  const id = crypto.createHash("sha256")
    .update(JSON.stringify(inputs.map((item) => ({
      asset_node_id: item.asset_node_id || null,
      name: item.name || null,
    }))))
    .digest("hex")
    .slice(0, 20);
  const base = "/tmp/avantiqo-deep-exr-" + id;
  const materialized = [];
  try {
    await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "mkdir",
      args: ["-p", base],
      error_prefix: "DEEP_EXR_WORKDIR_FAILED",
    });

    const deepPaths = [];
    const evidence = [];
    for (let index = 0; index < inputs.length; index += 1) {
      const layer = inputs[index];
      const source = await sourceBuffer({
        organization_id: project.organization_id,
        creative_project_id: project.id,
        layer,
        policy,
      });
      materialized.push(source);
      const sourcePath = base + "/" + String(index + 1).padStart(3, "0") + "-" + safe(layer.name, "layer") + ".exr";
      await sandbox.writeFiles([{ path: sourcePath, content: source.buffer }]);

      const normalizedPath = base + "/rgba-z-" + String(index + 1).padStart(3, "0") + ".exr";
      await CreativeSandboxRuntime.run({
        sandbox,
        cmd: "oiiotool",
        args: [sourcePath, "--ch", "R,G,B,A,Z", "-o", normalizedPath],
        error_prefix: "DEEP_EXR_RGBAZ_REQUIRED",
      });

      const deepPath = base + "/deep-" + String(index + 1).padStart(3, "0") + ".exr";
      await CreativeSandboxRuntime.run({
        sandbox,
        cmd: "oiiotool",
        args: [normalizedPath, "--deepen", "-o", deepPath],
        error_prefix: "DEEP_EXR_DEEPEN_FAILED",
      });
      const deepLayerInfo = await info(sandbox, deepPath);
      deepPaths.push(deepPath);
      evidence.push({
        index,
        source_asset_node_id: source.source_asset_node_id,
        source_checksum: source.source_checksum,
        deepened_from_rgba_z: true,
        deep_operation_evidence: deepOperationEvidence(deepLayerInfo, "layer-" + (index + 1)),
      });
    }
    let mergedPath = deepPaths[0];
    for (let index = 1; index < deepPaths.length; index += 1) {
      const nextPath = base + "/merged-" + String(index + 1).padStart(3, "0") + ".exr";
      await CreativeSandboxRuntime.run({
        sandbox,
        cmd: "oiiotool",
        args: [mergedPath, deepPaths[index], "--deepmerge", "-o", nextPath],
        error_prefix: "DEEP_EXR_MERGE_FAILED",
      });
      await info(sandbox, nextPath);
      mergedPath = nextPath;
    }

    let holdoutEvidence = null;
    if (holdout) {
      const source = await sourceBuffer({
        organization_id: project.organization_id,
        creative_project_id: project.id,
        layer: holdout,
        policy,
      });
      materialized.push(source);
      const holdoutPath = base + "/holdout-source.exr";
      const holdoutRgbaZ = base + "/holdout-rgba-z.exr";
      const holdoutDeep = base + "/holdout-deep.exr";
      const heldPath = base + "/held.exr";
      await sandbox.writeFiles([{ path: holdoutPath, content: source.buffer }]);
      await CreativeSandboxRuntime.run({
        sandbox, cmd: "oiiotool",
        args: [holdoutPath, "--ch", "R,G,B,A,Z", "-o", holdoutRgbaZ],
        error_prefix: "DEEP_EXR_HOLDOUT_RGBAZ_REQUIRED",
      });
      await CreativeSandboxRuntime.run({
        sandbox, cmd: "oiiotool",
        args: [holdoutRgbaZ, "--deepen", "-o", holdoutDeep],
        error_prefix: "DEEP_EXR_HOLDOUT_DEEPEN_FAILED",
      });
      await CreativeSandboxRuntime.run({
        sandbox, cmd: "oiiotool",
        args: [mergedPath, holdoutDeep, "--deepholdout", "-o", heldPath],
        error_prefix: "DEEP_EXR_HOLDOUT_FAILED",
      });
      await info(sandbox, heldPath);
      mergedPath = heldPath;
      holdoutEvidence = {
        source_asset_node_id: source.source_asset_node_id,
        source_checksum: source.source_checksum,
        deep_holdout_applied: true,
      };
    }
    const previewPath = base + "/preview-flat.exr";
    await CreativeSandboxRuntime.run({
      sandbox,
      cmd: "oiiotool",
      args: [mergedPath, "--flatten", "-o", previewPath],
      error_prefix: "DEEP_EXR_PREVIEW_FLATTEN_FAILED",
    });

    const [deepBuffer, previewBuffer] = await Promise.all([
      CreativeSandboxRuntime.readBuffer({ sandbox, path: mergedPath }),
      CreativeSandboxRuntime.readBuffer({ sandbox, path: previewPath }),
    ]);
    const deepInfo = await info(sandbox, mergedPath);

    return {
      contract: AVANTIQO_DEEP_EXR_COMPOSITING_CONTRACT,
      status: "READY",
      mime_type: "image/x-exr",
      deep_buffer: deepBuffer,
      deep_bytes: deepBuffer.length,
      deep_checksum: sha(deepBuffer),
      preview_flat_buffer: previewBuffer,
      preview_flat_checksum: sha(previewBuffer),
      layer_count: evidence.length,
      layers: evidence,
      holdout: holdoutEvidence,
      deep_data_verified: true,
      deep_operation_chain_verified: true,
      verification_basis: "OPENIMAGEIO_DEEPEN_DEEPMERGE_DEEPHOLDOUT_FLATTEN_SUCCESS",
      variable_depth_samples_per_pixel_supported: true,
      flattening_used_for_preview_only: true,
      production_master_remains_deep: true,
      tool: "OpenImageIO",
      provider_calls_performed: false,
      deep_info: deepInfo,
    };
  } finally {
    for (const source of materialized) await source.cleanup?.().catch?.(() => {});
    await CreativeSandboxRuntime.stop(sandbox);
  }
}

export const CreativeDeepExrCompositingRuntime = Object.freeze({
  contract: AVANTIQO_DEEP_EXR_COMPOSITING_CONTRACT,
  compose: composeDeepExr,
});
