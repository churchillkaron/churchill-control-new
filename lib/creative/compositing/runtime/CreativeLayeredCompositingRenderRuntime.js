import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  creativeStorageUri,
} from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import {
  materializeMedia,
  CreativeMediaInspectionRuntime,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CreativeCompositingRuntime,
} from "@/lib/creative/compositing/runtime/CreativeCompositingRuntime";

const CONTRACT = "AVANTIQO_LAYERED_COMPOSITING_RENDER_V1";
const supabaseAdmin = getServiceSupabase();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = null) {
  const number = finite(value, null);
  return number !== null && number > 0 ? number : fallback;
}

function safe(value, fallback = "composite") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    let timer = null;
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("LAYERED_COMPOSITING_RENDER_TIMEOUT"));
      }, timeoutMs);
    }
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `LAYERED_COMPOSITING_RENDER_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function eligible(node = {}) {
  return Boolean(
    node?.id &&
    node.url &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED &&
    node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED &&
    node.metadata?.blocked !== true,
  );
}

function sameShot(node = {}, shotId) {
  return text(node.metadata?.shot_id) === text(shotId);
}

function selectedBase(nodes = [], shotId) {
  return nodes.find((node) =>
    node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    sameShot(node, shotId) &&
    node.metadata?.shot_candidate_selected === true &&
    node.metadata?.shot_candidate_review_passed === true &&
    eligible(node),
  ) || null;
}

function resolveByTask(nodes = [], taskId) {
  return nodes.find((node) =>
    text(node.production_task_id || node.metadata?.production_task_id) === text(taskId) &&
    eligible(node),
  ) || null;
}

function resolveLayerAsset(layer = {}, nodes = [], shotId) {
  if (layer.auto_resolved_selected_candidate === true || layer.layer_role === "BASE_PLATE") {
    if (layer.asset_node_id) {
      return nodes.find((node) => text(node.id) === text(layer.asset_node_id) && eligible(node)) || null;
    }
    if (layer.production_task_id) return resolveByTask(nodes, layer.production_task_id);
    return selectedBase(nodes, shotId);
  }
  if (layer.asset_node_id) {
    return nodes.find((node) => text(node.id) === text(layer.asset_node_id) && eligible(node)) || null;
  }
  if (layer.production_task_id) return resolveByTask(nodes, layer.production_task_id);
  return null;
}

function verifyGovernedSource(layer, node) {
  const blockers = [];
  if (!node) return ["COMPOSITING_SOURCE_ASSET_NOT_FOUND"];
  if (layer.layer_role === "SIMULATION_PASS") {
    if (
      node.metadata?.simulation_qc_sealed !== true &&
      node.metadata?.shot_candidate_simulation_qc_passed !== true
    ) blockers.push("COMPOSITING_SIMULATION_QC_SEAL_REQUIRED");
  }
  if (["VFX_ELEMENT", "SET_EXTENSION", "SCREEN_INSERT", "ATMOSPHERE", "LIGHTING_PASS", "BEAUTY_CLEANUP"].includes(layer.layer_role)) {
    const vfxApplicable =
      node.metadata?.vfx_contract === "AVANTIQO_VFX_V1" ||
      node.metadata?.shot_candidate_vfx_applicable === true;
    if (
      vfxApplicable &&
      node.metadata?.vfx_qc_sealed !== true &&
      node.metadata?.shot_candidate_vfx_qc_passed !== true
    ) blockers.push("COMPOSITING_VFX_QC_SEAL_REQUIRED");
  }
  if (layer.layer_role === "BASE_PLATE") {
    if (node.metadata?.shot_candidate_review_passed !== true) blockers.push("COMPOSITING_BASE_WORLD_CLASS_REVIEW_REQUIRED");
    if (node.metadata?.selected_for_master !== true && node.metadata?.shot_candidate_selected !== true) blockers.push("COMPOSITING_BASE_SELECTED_CANDIDATE_REQUIRED");
  }
  return blockers;
}

function sourceIdentity(node = {}) {
  return {
    asset_node_id: node.id,
    checksum: node.technical?.checksum || null,
    updated_at: node.updated_at || null,
  };
}

function identity(contract, resolvedLayers) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract_hash: contract.contract_hash,
    sources: resolvedLayers.map(({ layer, node, matte }) => ({
      layer_id: layer.layer_id,
      source: sourceIdentity(node),
      matte: matte ? sourceIdentity(matte) : null,
    })),
  })).digest("hex");
}

async function materialize(node, organizationId, policy) {
  return materializeMedia({
    url: node.url,
    file_name: node.name || null,
    mime_type: node.technical?.mime_type || null,
    organization_id: organizationId,
    policy,
  });
}

function mediaIsImage(node = {}) {
  return node.type === CREATIVE_ASSET_NODE_TYPES.IMAGE ||
    node.type === CREATIVE_ASSET_NODE_TYPES.LOGO ||
    text(node.technical?.mime_type).toLowerCase().startsWith("image/");
}

function layerPrep(inputIndex, layer, baseWidth, baseHeight, fps, outputLabel) {
  const transform = object(layer.transform);
  const timing = object(layer.timing);
  const width = positive(transform.width, null);
  const height = positive(transform.height, null);
  const sourceIn = Math.max(0, finite(timing.source_in_seconds, 0));
  const duration = positive(timing.duration_seconds, null);
  const filters = [];
  if (sourceIn || duration) {
    const end = duration ? sourceIn + duration : null;
    filters.push(`trim=start=${sourceIn}${end ? `:end=${end}` : ""}`);
  }
  filters.push("setpts=PTS-STARTPTS");
  if (width || height) {
    filters.push(`scale=${width || -1}:${height || -1}:force_original_aspect_ratio=decrease`);
  }
  filters.push(`fps=${fps}`, "setsar=1", "format=rgba");
  if (layer.alpha_mode === "OPAQUE") {
    filters.push("colorchannelmixer=aa=1");
  }
  if (layer.opacity < 1) {
    filters.push(`colorchannelmixer=aa=${Math.max(0, Math.min(1, layer.opacity))}`);
  }
  return `[${inputIndex}:v]${filters.join(",")}[${outputLabel}]`;
}

function blendModeFilter(mode) {
  return ({
    ADD: "addition",
    SCREEN: "screen",
    MULTIPLY: "multiply",
    OVERLAY: "overlay",
    LIGHTEN: "lighten",
    DARKEN: "darken",
  })[mode] || null;
}

async function upload({ organizationId, projectId, renderId, outputPath, policy }) {
  const bucket =
    policy.render_bucket ||
    policy.renderBucket ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("RENDER_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "composites",
    safe(renderId),
    "shot-composite.mp4",
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType: "video/mp4", upsert: false });
  if (error) throw error;
  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    file_size_bytes: buffer.length,
  };
}

export const CreativeLayeredCompositingRenderRuntime = Object.freeze({
  contract: CONTRACT,

  async render({
    organization_id,
    creative_project_id,
    shot,
    nodes,
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id || !creative_project_id || !shot?.id) {
      throw new Error("COMPOSITING_RENDER_SCOPE_REQUIRED");
    }
    const verification = CreativeCompositingRuntime.verify({
      ...shot,
      compositing_contract: shot.compositing_contract,
    });
    if (!verification.applicable) return { applicable: false, render: null };
    if (verification.status !== "READY") {
      throw new Error(`COMPOSITING_CONTRACT_BLOCKED:${verification.blocking_issues.map((item) => item.code).join(",")}`);
    }
    const contract = verification.compositing_contract;
    const projectNodes = list(nodes);
    const resolvedLayers = [];
    const blockers = [];
    for (const layer of contract.layers) {
      const node = resolveLayerAsset(layer, projectNodes, shot.id);
      for (const blocker of verifyGovernedSource(layer, node)) {
        blockers.push(`${layer.layer_id}:${blocker}`);
      }
      let matte = null;
      if (layer.alpha_mode === "LUMA_MATTE") {
        matte = projectNodes.find((candidate) => text(candidate.id) === text(layer.matte_asset_node_id) && eligible(candidate)) || null;
        if (!matte) blockers.push(`${layer.layer_id}:COMPOSITING_MATTE_ASSET_NOT_FOUND`);
      }
      resolvedLayers.push({ layer, node, matte });
    }
    if (blockers.length) {
      const error = new Error(`COMPOSITING_SOURCE_GATE_BLOCKED:${blockers.join(",")}`);
      error.blockers = blockers;
      throw error;
    }

    const base = resolvedLayers.find(({ layer }) => layer.layer_role === "BASE_PLATE");
    const width = positive(base.node.technical?.width, null);
    const height = positive(base.node.technical?.height, null);
    const duration = positive(base.node.technical?.duration_seconds, null);
    const fps = positive(
      base.node.technical?.frame_rate ||
      base.node.technical?.fps ||
      policy.frame_rate,
      null,
    );
    if (!width || !height || !duration || !fps) {
      throw new Error("COMPOSITING_BASE_TECHNICAL_EVIDENCE_REQUIRED");
    }

    const compositeIdentity = identity(contract, resolvedLayers);
    const existing = !force
      ? projectNodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
          node.metadata?.compositing_render_contract === CONTRACT &&
          node.metadata?.compositing_identity === compositeIdentity &&
          eligible(node),
        )
      : null;
    if (existing) return { applicable: true, render: existing, reused: true, contract };

    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");
    const timeoutMs = positive(
      policy.render_timeout_ms ||
      policy.renderTimeoutMs ||
      process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS,
      null,
    );
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-composite-"));
    const materials = [];
    try {
      const args = ["-y"];
      const inputs = [];
      for (const resolved of resolvedLayers) {
        const source = await materialize(resolved.node, organization_id, policy);
        materials.push(source);
        if (mediaIsImage(resolved.node)) args.push("-loop", "1");
        args.push("-i", source.file_path);
        const sourceIndex = inputs.length;
        inputs.push({ type: "source", ...resolved, inputIndex: sourceIndex });
        if (resolved.matte) {
          const matte = await materialize(resolved.matte, organization_id, policy);
          materials.push(matte);
          if (mediaIsImage(resolved.matte)) args.push("-loop", "1");
          args.push("-i", matte.file_path);
          resolved.matteInputIndex = inputs.length;
          inputs.push({ type: "matte", node: resolved.matte, inputIndex: inputs.length });
        }
      }

      const filters = [];
      const baseResolved = resolvedLayers.find(({ layer }) => layer.layer_role === "BASE_PLATE");
      const baseInput = inputs.find((input) => input.type === "source" && input.layer.layer_id === baseResolved.layer.layer_id);
      filters.push(
        `[${baseInput.inputIndex}:v]trim=start=0:end=${duration},setpts=PTS-STARTPTS,scale=${width}:${height},fps=${fps},setsar=1,format=rgba[comp0]`,
      );
      let current = "comp0";
      let compositeIndex = 1;
      for (const resolved of resolvedLayers.filter(({ layer }) => layer.layer_role !== "BASE_PLATE")) {
        const input = inputs.find((candidate) => candidate.type === "source" && candidate.layer.layer_id === resolved.layer.layer_id);
        const prepLabel = `layer${compositeIndex}`;
        filters.push(layerPrep(input.inputIndex, resolved.layer, width, height, fps, prepLabel));
        let layerLabel = prepLabel;
        if (resolved.layer.alpha_mode === "LUMA_MATTE") {
          const matteLabel = `matte${compositeIndex}`;
          filters.push(
            `[${resolved.matteInputIndex}:v]setpts=PTS-STARTPTS,scale=${resolved.layer.transform.width || width}:${resolved.layer.transform.height || height}:force_original_aspect_ratio=decrease,format=gray[${matteLabel}]`,
          );
          const alphaLabel = `layeralpha${compositeIndex}`;
          filters.push(`[${prepLabel}][${matteLabel}]alphamerge[${alphaLabel}]`);
          layerLabel = alphaLabel;
        }
        const timelineIn = Math.max(0, finite(resolved.layer.timing?.timeline_in_seconds, 0));
        const layerDuration = positive(resolved.layer.timing?.duration_seconds, duration - timelineIn);
        const end = Math.min(duration, timelineIn + layerDuration);
        const next = `comp${compositeIndex}`;
        const x = finite(resolved.layer.transform?.x, 0);
        const y = finite(resolved.layer.transform?.y, 0);
        if (resolved.layer.blend_mode === "NORMAL") {
          filters.push(
            `[${current}][${layerLabel}]overlay=x=${x}:y=${y}:enable='between(t,${timelineIn},${end})':eof_action=pass[${next}]`,
          );
        } else {
          if (x !== 0 || y !== 0) {
            throw new Error(`COMPOSITING_BLEND_TRANSFORM_UNSUPPORTED:${resolved.layer.layer_id}`);
          }
          const blend = blendModeFilter(resolved.layer.blend_mode);
          if (!blend) throw new Error(`COMPOSITING_BLEND_MODE_UNSUPPORTED:${resolved.layer.blend_mode}`);
          filters.push(
            `[${current}][${layerLabel}]blend=all_mode=${blend}:all_opacity=${resolved.layer.opacity}:enable='between(t,${timelineIn},${end})'[${next}]`,
          );
        }
        current = next;
        compositeIndex += 1;
      }
      filters.push(`[${current}]format=yuv420p[compositeout]`);

      const outputPath = path.join(directory, "shot-composite.mp4");
      args.push(
        "-filter_complex", filters.join(";"),
        "-map", "[compositeout]",
        "-map", `${baseInput.inputIndex}:a?`,
        "-c:v", String(policy.composite_video_codec || "libx264"),
        "-pix_fmt", "yuv420p",
        "-r", String(fps),
        "-c:a", String(policy.composite_audio_codec || "aac"),
        "-t", String(duration),
        outputPath,
      );
      await run(ffmpegPath, args, timeoutMs);

      const renderId = crypto.randomUUID();
      const uploaded = await upload({
        organizationId: organization_id,
        projectId: creative_project_id,
        renderId,
        outputPath,
        policy,
      });
      const inspection = await CreativeMediaInspectionRuntime.inspect({
        url: uploaded.url,
        file_name: path.basename(outputPath),
        mime_type: "video/mp4",
        organization_id,
        policy,
      });
      const render = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id,
        parent_asset_node_id: base.node.id,
        type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${shot.title || `Shot ${shot.id}`} layered composite`,
        description: "Governed layered shot composite assembled from reviewed source assets.",
        url: uploaded.url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "governed_layered_compositing",
          capability: "creative.shot.composite",
          generation_version: 1,
        },
        technical: {
          ...(inspection.technical || {}),
          mime_type: "video/mp4",
          checksum: uploaded.checksum,
          file_size_bytes: uploaded.file_size_bytes,
        },
        intelligence: {
          quality_score: base.node.intelligence?.quality_score ?? null,
          brand_match_score: base.node.intelligence?.brand_match_score ?? null,
          reuse_score: null,
          safety_status: base.node.intelligence?.safety_status || "UNKNOWN",
          tags: [...new Set([...(base.node.intelligence?.tags || []), "layered-composite"])],
        },
        reuse: { reusable: false, approved_for_reuse: false },
        review: { ai_reviewed: true, human_reviewed: false, approved: false },
        metadata: {
          shot_id: shot.id,
          scene_id: shot.scene_id || null,
          compositing_render_contract: CONTRACT,
          compositing_contract: CreativeCompositingRuntime.contract,
          compositing_contract_hash: contract.contract_hash,
          compositing_identity: compositeIdentity,
          compositing_layer_count: resolvedLayers.length,
          compositing_layer_sources: resolvedLayers.map(({ layer, node, matte }) => ({
            layer_id: layer.layer_id,
            layer_role: layer.layer_role,
            asset_node_id: node.id,
            matte_asset_node_id: matte?.id || null,
          })),
          compositing_source_gate_passed: true,
          compositing_rendered_deterministically: true,
          compositing_actual_pixels_created: true,
          compositing_requires_final_perceptual_review: true,
          selected_for_master: true,
          include_in_master: true,
          original_selected_candidate_asset_node_id: base.node.id,
          created_at: new Date().toISOString(),
        },
      });
      const stored = await AssetGraphRepository.create(render);

      for (const { node } of resolvedLayers) {
        await AssetGraphRepository.update(node.id, {
          metadata: {
            ...object(node.metadata),
            consumed_by_compositing_asset_node_id: stored.id,
            include_in_master: false,
            composited_for_shot_id: shot.id,
          },
        });
      }

      return {
        applicable: true,
        render: stored,
        reused: false,
        contract,
        source_asset_node_ids: resolvedLayers.map(({ node }) => node.id),
      };
    } finally {
      await Promise.all(materials.map((material) => material.cleanup()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});
