import crypto from "node:crypto";
import { spawn } from "node:child_process";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function runProcess(command, args, timeoutMs = null) {
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
      else resolve(Buffer.concat(stderr).toString("utf8"));
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("TEMPORAL_ANALYSIS_TIMEOUT"));
      }, timeoutMs);
    }

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `TEMPORAL_ANALYSIS_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function parseSceneScores(log = "") {
  const rows = [];
  const pattern = /pts_time:([0-9.]+)[\s\S]*?lavfi\.scene_score=([0-9.]+)/g;
  let match;

  while ((match = pattern.exec(log))) {
    const time = finite(match[1]);
    const score = finite(match[2]);
    if (time === null || score === null) continue;
    rows.push({ time_seconds: time, score });
  }

  return rows.sort((left, right) => left.time_seconds - right.time_seconds);
}

function sceneRanges({ boundaries, duration, minimumDuration = 0 }) {
  const points = [0, ...boundaries.map((item) => item.time_seconds)];
  if (duration !== null && duration > 0) points.push(duration);
  const unique = [...new Set(points.map((value) => Number(value.toFixed(6))))]
    .sort((left, right) => left - right);
  const ranges = [];

  for (let index = 0; index < unique.length - 1; index += 1) {
    const start = unique[index];
    const end = unique[index + 1];
    if (end <= start || end - start < minimumDuration) continue;

    const boundary = boundaries.find((item) => item.time_seconds === start);
    ranges.push({
      index: ranges.length,
      start_seconds: start,
      end_seconds: end,
      duration_seconds: end - start,
      cut_score: boundary?.score ?? null,
    });
  }

  return ranges;
}

function identity(parent, options = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    parent_id: parent.id,
    checksum:
      parent.technical?.checksum ||
      parent.technical?.checksum_sha256 ||
      null,
    threshold: options.threshold ?? null,
    minimum_scene_seconds:
      options.minimum_scene_seconds ??
      options.minimumSceneSeconds ??
      null,
  })).digest("hex");
}

export const CreativeTemporalAnalysisRuntime = {
  async analyze({
    organization_id,
    parent_asset_node_id,
    options = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!parent_asset_node_id) throw new Error("parent_asset_node_id required");

    const parent = await AssetGraphRepository.getById(parent_asset_node_id);
    if (!parent || parent.organization_id !== organization_id) {
      throw new Error("Parent asset node not found");
    }
    if (!parent.url) throw new Error("Parent asset node has no media URL");

    const mediaKind = String(
      parent.technical?.media_kind ||
      parent.type ||
      "",
    ).toUpperCase();
    if (!mediaKind.includes("VIDEO")) {
      throw new Error("VIDEO_ASSET_REQUIRED");
    }

    const analysisIdentity = identity(parent, options);
    const existingNodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: parent.creative_project_id,
    });
    const existing = !force
      ? existingNodes.filter((node) =>
          node.parent_asset_node_id === parent.id &&
          node.metadata?.temporal_analysis_identity === analysisIdentity,
        )
      : [];

    if (existing.length) {
      return {
        scenes: existing,
        reused: true,
      };
    }

    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) throw new Error("FFMPEG_NOT_CONFIGURED");

    const threshold = finite(
      options.threshold ??
      policy.scene_threshold ??
      policy.sceneThreshold ??
      process.env.CREATIVE_MEDIA_SCENE_THRESHOLD,
    );
    if (threshold === null || threshold < 0 || threshold > 1) {
      throw new Error("VALID_SCENE_THRESHOLD_REQUIRED");
    }

    const minimumDuration = finite(
      options.minimum_scene_seconds ??
      options.minimumSceneSeconds ??
      policy.minimum_scene_seconds ??
      policy.minimumSceneSeconds ??
      0,
    ) || 0;
    const timeoutMs = finite(
      policy.temporal_timeout_ms ??
      policy.temporalTimeoutMs ??
      process.env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS,
    );
    const materialized = await materializeMedia({
      url: parent.url,
      file_name: parent.name || null,
      mime_type: parent.technical?.mime_type || null,
      policy,
    });

    try {
      const log = await runProcess(
        ffmpegPath,
        [
          "-hide_banner",
          "-i",
          materialized.file_path,
          "-filter:v",
          `select='gt(scene,${threshold})',metadata=print`,
          "-an",
          "-f",
          "null",
          "-",
        ],
        timeoutMs,
      );
      const boundaries = parseSceneScores(log);
      const duration = finite(parent.technical?.duration_seconds);
      const ranges = sceneRanges({
        boundaries,
        duration,
        minimumDuration,
      });

      if (!ranges.length && duration !== null && duration > 0) {
        ranges.push({
          index: 0,
          start_seconds: 0,
          end_seconds: duration,
          duration_seconds: duration,
          cut_score: null,
        });
      }

      const scenes = [];
      for (const range of ranges) {
        const node = createCreativeAssetNode({
          organization_id,
          creative_project_id: parent.creative_project_id,
          creative_asset_id: parent.creative_asset_id,
          parent_asset_node_id: parent.id,
          type: CREATIVE_ASSET_NODE_TYPES.VIDEO,
          status: CREATIVE_ASSET_NODE_STATUS.DERIVED,
          name: `${parent.name || "Video"} scene ${range.index + 1}`,
          description: "",
          url: parent.url,
          storage_path: parent.storage_path || null,
          lineage: {
            source: "scene_detection",
            provider_id: null,
            capability: "media.scene.detect",
            generation_version: options.version || 1,
          },
          technical: {
            ...(parent.technical || {}),
            duration_seconds: range.duration_seconds,
          },
          intelligence: {
            tags: Array.isArray(options.tags) ? options.tags : [],
            safety_status: parent.intelligence?.safety_status || "UNKNOWN",
          },
          cost: {
            currency: null,
            estimated: 0,
            actual: 0,
            saved_by_reuse: 0,
          },
          reuse: {
            reusable: false,
            approved_for_reuse: false,
          },
          review: {
            ai_reviewed: false,
            human_reviewed: false,
            approved: false,
          },
          metadata: {
            temporal_analysis_identity: analysisIdentity,
            source_asset_node_id: parent.id,
            virtual_clip: true,
            clip_range: range,
            scene_index: range.index,
            scene_threshold: threshold,
            minimum_scene_seconds: minimumDuration,
            created_at: new Date().toISOString(),
          },
        });

        scenes.push(await AssetGraphRepository.create(node));
      }

      return {
        scenes,
        reused: false,
        boundaries,
      };
    } finally {
      await materialized.cleanup();
    }
  },
};
