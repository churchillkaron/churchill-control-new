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
  CreativeRenderTechnicalQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";

const CONTRACT = "CREATIVE_PROFESSIONAL_MASTER_AUDIO_LOCK_V1";
const supabaseAdmin = getServiceSupabase();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value) {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function safe(value, fallback = "render") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function extension(profile = {}) {
  return safe(
    String(profile.extension || profile.container || "mp4")
      .replace(/^\./, "")
      .toLowerCase(),
    "mp4",
  );
}

function mime(ext) {
  return ({
    mp4: "video/mp4",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    webm: "video/webm",
  })[ext] || "application/octet-stream";
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
        finish(new Error("PROFESSIONAL_MASTER_AUDIO_MUX_TIMEOUT"));
      }, timeoutMs);
    }

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `PROFESSIONAL_MASTER_AUDIO_MUX_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function identity(videoRender = {}, masterRender = {}, profile = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    contract: CONTRACT,
    video_render_id: videoRender.id,
    video_checksum: videoRender.technical?.checksum || null,
    master_render_id: masterRender.id,
    master_checksum: masterRender.technical?.checksum || null,
    master_contract_hash:
      masterRender.metadata?.master_soundtrack_contract_hash || null,
    profile,
  })).digest("hex");
}

async function upload({
  organizationId,
  projectId,
  renderId,
  outputPath,
  profile,
  policy,
}) {
  const bucket =
    policy.render_bucket ||
    policy.renderBucket ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("RENDER_STORAGE_BUCKET_REQUIRED");

  const ext = extension(profile);
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "renders",
    safe(renderId),
    `professional-master-audio-lock.${ext}`,
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const contentType = profile.mime_type || profile.mimeType || mime(ext);
  const uploadOptions = { contentType, upsert: false };
  const cacheControl =
    policy.render_cache_control ||
    policy.renderCacheControl ||
    process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL;
  if (cacheControl) uploadOptions.cacheControl = String(cacheControl);

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, uploadOptions);
  if (error) throw error;

  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export const CreativeProfessionalMasterAudioMuxRuntime = Object.freeze({
  contract: CONTRACT,

  async mux({
    organization_id,
    video_render,
    master_render,
    export_profile = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!video_render?.id || !video_render?.url) {
      throw new Error("PROFESSIONAL_FINISHED_VIDEO_REQUIRED");
    }
    if (!master_render?.id || !master_render?.url) {
      throw new Error("MASTER_SOUNDTRACK_RENDER_REQUIRED");
    }
    if (
      String(video_render.organization_id) !== String(organization_id) ||
      String(master_render.organization_id) !== String(organization_id)
    ) {
      throw new Error("PROFESSIONAL_MASTER_AUDIO_ORGANIZATION_MISMATCH");
    }
    if (
      String(video_render.creative_project_id) !==
      String(master_render.creative_project_id)
    ) {
      throw new Error("PROFESSIONAL_MASTER_AUDIO_PROJECT_MISMATCH");
    }
    if (master_render.metadata?.master_soundtrack_integrity_passed !== true) {
      throw new Error("APPROVED_MASTER_SOUNDTRACK_INTEGRITY_REQUIRED");
    }

    const muxIdentity = identity(video_render, master_render, export_profile);
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id: video_render.creative_project_id,
    });
    const existing = !force
      ? nodes.find((node) =>
          node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
          node.metadata?.professional_master_audio_lock_identity === muxIdentity,
        )
      : null;
    if (existing) {
      return {
        render: existing,
        technical_qc: existing.metadata?.technical_qc || null,
        reused: true,
      };
    }

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
    );

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-master-audio-lock-"),
    );
    const [video, master] = await Promise.all([
      materializeMedia({
        url: video_render.url,
        file_name: video_render.name || "professional-finish",
        mime_type: video_render.technical?.mime_type || null,
        organization_id,
        policy,
      }),
      materializeMedia({
        url: master_render.url,
        file_name: master_render.name || "approved-master",
        mime_type: master_render.technical?.mime_type || null,
        organization_id,
        policy,
      }),
    ]);

    try {
      const outputPath = path.join(
        directory,
        `professional-master-audio-lock.${extension(export_profile)}`,
      );
      const args = [
        "-y",
        "-i",
        video.file_path,
        "-i",
        master.file_path,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-map",
        "0:s?",
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-c:s",
        "copy",
        outputPath,
      ];
      await run(ffmpegPath, args, timeoutMs);

      const renderId = crypto.randomUUID();
      const uploaded = await upload({
        organizationId: organization_id,
        projectId: video_render.creative_project_id,
        renderId,
        outputPath,
        profile: export_profile,
        policy,
      });
      const inspection = await CreativeMediaInspectionRuntime.inspect({
        url: uploaded.url,
        file_name: path.basename(outputPath),
        mime_type: uploaded.mime_type,
        organization_id,
        policy,
      });
      const expectedDuration = positive(
        video_render.technical?.duration_seconds ||
        master_render.technical?.duration_seconds,
      );
      const qc = CreativeRenderTechnicalQualityRuntime.evaluate({
        technical: inspection.technical || {},
        profile: export_profile,
        expected_duration_seconds: expectedDuration,
        audio_expected: true,
      });
      const node = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id: video_render.creative_project_id,
        parent_asset_node_id: video_render.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: qc.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${video_render.name || "Professional finish"} - locked master audio`,
        description:
          "Professional visual finish with the approved master soundtrack restored by stream-copy after all visual finishing.",
        url: uploaded.url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "professional_master_audio_lock",
          capability: "creative.post_production.master_audio_lock",
          generation_version: 1,
        },
        technical: {
          ...(inspection.technical || {}),
          mime_type: uploaded.mime_type,
          checksum: uploaded.checksum,
          file_size_bytes: uploaded.file_size_bytes,
        },
        intelligence: {
          quality_score: null,
          brand_match_score: null,
          reuse_score: null,
          safety_status: "UNKNOWN",
          tags: ["professional-finishing", "master-audio-locked"],
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: qc.passed
            ? "Visual finishing preserved; approved master audio restored by stream-copy."
            : "Master-audio lock output failed technical QC.",
        },
        metadata: {
          professional_master_audio_lock_contract: CONTRACT,
          professional_master_audio_lock_identity: muxIdentity,
          professional_finished_video_asset_node_id: video_render.id,
          master_audio_source_render_asset_node_id: master_render.id,
          base_render_asset_node_id:
            video_render.metadata?.base_render_asset_node_id ||
            master_render.id,
          timeline_asset_node_id:
            video_render.metadata?.timeline_asset_node_id ||
            master_render.metadata?.timeline_asset_node_id ||
            null,
          professional_finishing:
            video_render.metadata?.professional_finishing || null,
          professional_finishing_contract:
            video_render.metadata?.professional_finishing_contract || null,
          finishing_identity:
            video_render.metadata?.finishing_identity || null,
          master_soundtrack_contract:
            master_render.metadata?.master_soundtrack_contract || null,
          master_soundtrack_contract_hash:
            master_render.metadata?.master_soundtrack_contract_hash || null,
          master_soundtrack_asset_node_id:
            master_render.metadata?.master_soundtrack_asset_node_id || null,
          master_soundtrack_source_checksum:
            master_render.metadata?.master_soundtrack_source_checksum || null,
          master_soundtrack_integrity_before_finishing:
            master_render.metadata?.master_soundtrack_integrity || null,
          master_soundtrack_integrity_passed_before_finishing: true,
          master_audio_stream_copy: true,
          visual_stream_copy_from_professional_finish: true,
          source_clip_audio_included: false,
          provider_added_music_allowed: false,
          additional_music_tracks_allowed: false,
          export_profile: object(export_profile),
          storage_bucket: uploaded.bucket,
          inspection_status: inspection.status,
          inspection_reason: inspection.reason,
          technical_qc: qc,
          created_at: new Date().toISOString(),
        },
      });

      return {
        render: await AssetGraphRepository.create(node),
        technical_qc: qc,
        reused: false,
      };
    } finally {
      await Promise.all([video.cleanup(), master.cleanup()]);
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});
