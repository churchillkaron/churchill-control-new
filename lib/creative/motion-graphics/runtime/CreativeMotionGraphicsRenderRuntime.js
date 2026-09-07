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
  CreativeDesignFontResolverRuntime,
} from "@/lib/creative/design/runtime/CreativeDesignFontResolverRuntime";
import {
  CreativeRenderTechnicalQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";
import {
  CreativeMotionGraphicsRuntime,
} from "./CreativeMotionGraphicsRuntime";

const CONTRACT = "AVANTIQO_MOTION_GRAPHICS_RENDER_V1";
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
  const number = finite(value, fallback);
  return number !== null && number > 0 ? number : fallback;
}

function safe(value, fallback = "motion-graphics") {
  return text(value || fallback)
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
    let settled = false;
    let timer = null;
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
        finish(new Error("MOTION_GRAPHICS_RENDER_TIMEOUT"));
      }, timeoutMs);
    }
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `MOTION_GRAPHICS_RENDER_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function escapeFilterText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%")
    .replace(/\n/g, "\\n");
}

function escapeFilterPath(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function ffColor(value) {
  return text(value).replace(/^#/, "0x") || "0xFFFFFF";
}

function placement(value, axis, margin = 64) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const normalized = text(value).toUpperCase();
  if (axis === "x") {
    if (["LEFT", "START"].includes(normalized)) return String(margin);
    if (["RIGHT", "END"].includes(normalized)) return `w-text_w-${margin}`;
    return "(w-text_w)/2";
  }
  if (["TOP", "START"].includes(normalized)) return String(margin);
  if (["BOTTOM", "END"].includes(normalized)) return `h-text_h-${margin}`;
  return "(h-text_h)/2";
}

function overlayPlacement(value, axis, margin = 64) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const normalized = text(value).toUpperCase();
  if (axis === "x") {
    if (["LEFT", "START"].includes(normalized)) return String(margin);
    if (["RIGHT", "END"].includes(normalized)) return `main_w-overlay_w-${margin}`;
    return "(main_w-overlay_w)/2";
  }
  if (["TOP", "START"].includes(normalized)) return String(margin);
  if (["BOTTOM", "END"].includes(normalized)) return `main_h-overlay_h-${margin}`;
  return "(main_h-overlay_h)/2";
}

function alphaExpression(item) {
  const start = item.timeline_in_seconds;
  const end = item.timeline_out_seconds;
  const entrance = item.entrance_duration_seconds;
  const exit = item.exit_duration_seconds;
  const opacity = item.opacity;
  const inEnd = start + entrance;
  const outStart = end - exit;
  if (item.animation === "NONE") return String(opacity);
  if (entrance <= 0 && exit <= 0) return String(opacity);
  const clauses = [];
  if (entrance > 0) clauses.push(`if(lt(t,${inEnd}),${opacity}*(t-${start})/${entrance},`);
  if (exit > 0) clauses.push(`if(gt(t,${outStart}),${opacity}*(${end}-t)/${exit},${opacity})`);
  else clauses.push(String(opacity));
  if (entrance > 0) clauses.push(")");
  return clauses.join("");
}

function animatedCoordinate(item, axis, baseExpression) {
  const start = item.timeline_in_seconds;
  const entrance = Math.max(0.001, item.entrance_duration_seconds || 0.001);
  const animation = item.animation;
  const offset = axis === "x" ? 120 : 80;
  if (animation === "SLIDE_LEFT" && axis === "x") {
    return `if(lt(t,${start + entrance}),${baseExpression}+${offset}*(1-(t-${start})/${entrance}),${baseExpression})`;
  }
  if (animation === "SLIDE_RIGHT" && axis === "x") {
    return `if(lt(t,${start + entrance}),${baseExpression}-${offset}*(1-(t-${start})/${entrance}),${baseExpression})`;
  }
  if (animation === "SLIDE_UP" && axis === "y") {
    return `if(lt(t,${start + entrance}),${baseExpression}+${offset}*(1-(t-${start})/${entrance}),${baseExpression})`;
  }
  if (animation === "SLIDE_DOWN" && axis === "y") {
    return `if(lt(t,${start + entrance}),${baseExpression}-${offset}*(1-(t-${start})/${entrance}),${baseExpression})`;
  }
  return baseExpression;
}

async function resolveFontBinding({ organizationId, projectId, item, materials, policy }) {
  const resolved = await CreativeDesignFontResolverRuntime.resolve({
    organization_id: organizationId,
    creative_project_id: projectId,
    font_asset_id: item.typography.font_asset_id,
    family: item.typography.family,
    weight: item.typography.weight,
    style: item.typography.style,
    exact: item.typography.exact_font,
    brand_locked: item.typography.brand_locked,
  });
  const node = resolved.asset_node;
  if (!node?.url) throw new Error(`MOTION_GRAPHICS_FONT_NOT_RENDERABLE:${item.element_id}`);
  const material = await materializeMedia({
    url: node.url,
    file_name: node.metadata?.original_file_name || node.name || `${node.id}.ttf`,
    mime_type: node.technical?.mime_type || null,
    organization_id: organizationId,
    policy,
  });
  materials.push(material);
  const checksum = text(material.checksum || node.technical?.checksum);
  if (!checksum) throw new Error(`MOTION_GRAPHICS_FONT_CHECKSUM_REQUIRED:${item.element_id}`);
  return {
    asset_node_id: node.id,
    file_path: material.file_path,
    checksum,
    family: resolved.font?.family || node.name || null,
    exact_match: resolved.exact_match === true,
    fallback_used: resolved.fallback_used === true,
  };
}

async function resolveLogoBinding({ organizationId, projectId, item, materials, policy }) {
  const node = await AssetGraphRepository.getById(item.logo_asset_node_id);
  if (
    !node ||
    text(node.organization_id) !== text(organizationId) ||
    (node.creative_project_id && text(node.creative_project_id) !== text(projectId)) ||
    ![CREATIVE_ASSET_NODE_TYPES.LOGO, CREATIVE_ASSET_NODE_TYPES.IMAGE].includes(node.type) ||
    !node.url ||
    [CREATIVE_ASSET_NODE_STATUS.REJECTED, CREATIVE_ASSET_NODE_STATUS.ARCHIVED].includes(node.status)
  ) {
    throw new Error(`MOTION_GRAPHICS_LOGO_ASSET_INVALID:${item.element_id}`);
  }
  if (node.review?.approved !== true && node.status !== CREATIVE_ASSET_NODE_STATUS.APPROVED) {
    throw new Error(`MOTION_GRAPHICS_LOGO_ASSET_NOT_APPROVED:${item.element_id}`);
  }
  const material = await materializeMedia({
    url: node.url,
    file_name: node.name || `${node.id}.png`,
    mime_type: node.technical?.mime_type || null,
    organization_id: organizationId,
    policy,
  });
  materials.push(material);
  const checksum = text(material.checksum || node.technical?.checksum);
  if (!checksum) throw new Error(`MOTION_GRAPHICS_LOGO_CHECKSUM_REQUIRED:${item.element_id}`);
  return {
    asset_node_id: node.id,
    file_path: material.file_path,
    checksum,
  };
}

function textFilters(current, item, font, index) {
  const output = `mgtext${index}`;
  const baseX = placement(item.position.x, "x", item.position.margin_x);
  const baseY = placement(item.position.y, "y", item.position.margin_y);
  const x = animatedCoordinate(item, "x", baseX);
  const y = animatedCoordinate(item, "y", baseY);
  const enable = `between(t,${item.timeline_in_seconds},${item.timeline_out_seconds})`;
  const alpha = alphaExpression(item);
  const filters = [];
  if (item.background.enabled) {
    const boxOutput = `mgbox${index}`;
    const boxX = placement(item.position.x, "x", item.position.margin_x) + `-${item.background.padding_x}`;
    const boxY = placement(item.position.y, "y", item.position.margin_y) + `-${item.background.padding_y}`;
    const estimatedWidth = Math.max(80, Math.round(item.exact_text.length * item.typography.size_px * 0.62));
    const estimatedHeight = Math.max(40, Math.round(item.typography.size_px * 1.35));
    filters.push(
      `[${current}]drawbox=x='${boxX}':y='${boxY}':w=${estimatedWidth + item.background.padding_x * 2}:h=${estimatedHeight + item.background.padding_y * 2}:color=${ffColor(item.background.color)}@${item.background.opacity}:t=fill:enable='${enable}'[${boxOutput}]`,
    );
    current = boxOutput;
  }
  filters.push(
    `[${current}]drawtext=fontfile='${escapeFilterPath(font.file_path)}':text='${escapeFilterText(item.exact_text)}':fontsize=${item.typography.size_px}:fontcolor=${ffColor(item.typography.color)}:x='${x}':y='${y}':alpha='${alpha}':enable='${enable}'[${output}]`,
  );
  return { filters, output };
}

function logoFilters(current, item, inputIndex, index) {
  const prep = `mglogo${index}`;
  const shifted = `mglogoshift${index}`;
  const output = `mglogoout${index}`;
  const width = positive(item.position.width, 220);
  const height = positive(item.position.height, -1);
  const alpha = alphaExpression(item);
  const start = item.timeline_in_seconds;
  const end = item.timeline_out_seconds;
  const x = animatedCoordinate(
    item,
    "x",
    overlayPlacement(item.position.x, "x", item.position.margin_x),
  );
  const y = animatedCoordinate(
    item,
    "y",
    overlayPlacement(item.position.y, "y", item.position.margin_y),
  );
  return {
    filters: [
      `[${inputIndex}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa=${item.opacity},setpts=PTS-STARTPTS[${prep}]`,
      `[${prep}]fade=t=in:st=0:d=${item.entrance_duration_seconds}:alpha=1,fade=t=out:st=${Math.max(0, item.duration_seconds - item.exit_duration_seconds)}:d=${item.exit_duration_seconds}:alpha=1,setpts=PTS+${start}/TB[${shifted}]`,
      `[${current}][${shifted}]overlay=x='${x}':y='${y}':enable='between(t,${start},${end})':eof_action=pass[${output}]`,
    ],
    output,
    alpha,
  };
}

function identity(baseRender, plan, bindings) {
  return crypto.createHash("sha256").update(JSON.stringify({
    base_render_id: baseRender.id,
    base_checksum: baseRender.technical?.checksum || null,
    plan_hash: plan.contract_hash,
    bindings,
  })).digest("hex");
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
    "motion-graphics",
    safe(renderId),
    "motion-graphics-master.mp4",
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType: "video/mp4",
      upsert: false,
    });
  if (error) throw error;
  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    file_size_bytes: buffer.length,
  };
}

export const CreativeMotionGraphicsRenderRuntime = Object.freeze({
  contract: CONTRACT,

  async render({
    organization_id,
    creative_project_id,
    timeline,
    base_render,
    export_profile = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id || !creative_project_id || !timeline?.id || !base_render?.id) {
      throw new Error("MOTION_GRAPHICS_RENDER_SCOPE_REQUIRED");
    }
    const plan = await CreativeMotionGraphicsRuntime.plan({
      organization_id,
      creative_project_id,
      timeline,
    });
    if (!plan.applicable) {
      return { applicable: false, render: base_render, reused: true, plan };
    }
    if (plan.status !== "READY") {
      throw new Error(`MOTION_GRAPHICS_PLAN_BLOCKED:${plan.blockers.join(",")}`);
    }
    const nodes = await AssetGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    });
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
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-motion-graphics-"));
    const materials = [];
    try {
      const base = await materializeMedia({
        url: base_render.url,
        file_name: base_render.name || "base-master.mp4",
        mime_type: base_render.technical?.mime_type || null,
        organization_id,
        policy,
      });
      materials.push(base);
      const args = ["-y", "-i", base.file_path];
      const bindings = [];
      const prepared = [];
      let nextInputIndex = 1;
      for (let index = 0; index < plan.elements.length; index += 1) {
        const item = plan.elements[index];
        if (["LOGO_BUG", "LOGO_STING"].includes(item.type)) {
          const logo = await resolveLogoBinding({
            organizationId: organization_id,
            projectId: creative_project_id,
            item,
            materials,
            policy,
          });
          args.push("-loop", "1", "-i", logo.file_path);
          bindings.push({ element_id: item.element_id, kind: "LOGO", ...logo });
          prepared.push({ item, inputIndex: nextInputIndex, index });
          nextInputIndex += 1;
        } else {
          const font = await resolveFontBinding({
            organizationId: organization_id,
            projectId: creative_project_id,
            item,
            materials,
            policy,
          });
          bindings.push({ element_id: item.element_id, kind: "FONT", ...font });
          prepared.push({ item, font, index });
        }
      }
      const renderIdentity = identity(base_render, plan, bindings.map((binding) => ({
        element_id: binding.element_id,
        kind: binding.kind,
        asset_node_id: binding.asset_node_id,
        checksum: binding.checksum,
      })));
      const existing = !force
        ? nodes.find((node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
            node.metadata?.motion_graphics_render_identity === renderIdentity &&
            node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED,
          )
        : null;
      if (existing) {
        return { applicable: true, render: existing, reused: true, plan, bindings };
      }

      const filters = ["[0:v]setpts=PTS-STARTPTS[mgbase]"];
      let current = "mgbase";
      for (const entry of prepared) {
        if (entry.font) {
          const result = textFilters(current, entry.item, entry.font, entry.index);
          filters.push(...result.filters);
          current = result.output;
        } else {
          const result = logoFilters(current, entry.item, entry.inputIndex, entry.index);
          filters.push(...result.filters);
          current = result.output;
        }
      }
      filters.push(`[${current}]format=yuv420p[mgout]`);
      const outputPath = path.join(directory, "motion-graphics-master.mp4");
      args.push(
        "-filter_complex", filters.join(";"),
        "-map", "[mgout]",
        "-map", "0:a?",
        "-c:v", String(export_profile.video_codec || export_profile.videoCodec || "libx264"),
        "-pix_fmt", String(export_profile.pixel_format || export_profile.pixelFormat || "yuv420p"),
        "-c:a", "copy",
        "-t", String(plan.duration_seconds || base_render.technical?.duration_seconds || 0),
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
        organization_id,
        url: uploaded.url,
        file_name: path.basename(outputPath),
        mime_type: "video/mp4",
        policy,
      });
      const qc = CreativeRenderTechnicalQualityRuntime.evaluate({
        technical: inspection.technical || {},
        profile: {
          ...export_profile,
          width: export_profile.width || base_render.technical?.width,
          height: export_profile.height || base_render.technical?.height,
          frame_rate:
            export_profile.frame_rate ||
            export_profile.frameRate ||
            base_render.technical?.frame_rate ||
            base_render.technical?.fps,
        },
        expected_duration_seconds: plan.duration_seconds || base_render.technical?.duration_seconds || null,
        audio_expected: list(base_render.technical?.streams).some((stream) => stream.codec_type === "audio") || Boolean(base_render.technical?.audio_codec),
      });
      const node = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id,
        parent_asset_node_id: base_render.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: qc.passed ? CREATIVE_ASSET_NODE_STATUS.REVIEW : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        name: `${base_render.name || "Master"} + motion graphics`,
        description: "Deterministic timeline-aware motion graphics master.",
        url: uploaded.url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "deterministic_motion_graphics_render",
          capability: "creative.motion-graphics.render",
          generation_version: 1,
        },
        technical: {
          ...(inspection.technical || {}),
          mime_type: "video/mp4",
          checksum: uploaded.checksum,
          file_size_bytes: uploaded.file_size_bytes,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: qc.passed ? "Motion graphics technical QC passed" : "Motion graphics technical QC failed",
        },
        metadata: {
          motion_graphics_contract: plan.contract,
          motion_graphics_render_contract: CONTRACT,
          motion_graphics_contract_hash: plan.contract_hash,
          motion_graphics_render_identity: renderIdentity,
          motion_graphics_element_count: plan.elements.length,
          motion_graphics_elements: plan.elements,
          motion_graphics_bindings: bindings.map((binding) => ({
            element_id: binding.element_id,
            kind: binding.kind,
            asset_node_id: binding.asset_node_id,
            checksum: binding.checksum,
            family: binding.family || null,
            exact_match: binding.exact_match ?? null,
            fallback_used: binding.fallback_used ?? null,
          })),
          exact_text_rendering: true,
          generated_text_pixels_used: false,
          generated_logo_redraw_used: false,
          editorial_picture_retimed: false,
          master_audio_modified: false,
          source_master_asset_node_id: base_render.id,
          technical_qc: qc,
          storage_bucket: uploaded.bucket,
          created_at: new Date().toISOString(),
        },
      });
      return {
        applicable: true,
        render: await AssetGraphRepository.create(node),
        reused: false,
        plan,
        bindings,
        technical_qc: qc,
        contract: CONTRACT,
      };
    } finally {
      await Promise.allSettled(materials.map((material) => material.cleanup()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});

export const AVANTIQO_MOTION_GRAPHICS_RENDER_CONTRACT = CONTRACT;
