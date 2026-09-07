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
import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import {
  CreativeRenderTechnicalQualityRuntime,
} from "@/lib/creative/quality/runtime/CreativeRenderTechnicalQualityRuntime";
import {
  CreativeMasterSoundtrackIntegrityRuntime,
} from "@/lib/creative/audio/runtime/CreativeMasterSoundtrackIntegrityRuntime";
import {
  ShotRuntime,
} from "@/lib/creative/shots/runtime/ShotRuntime";

const CONTRACT = "AVANTIQO_COLOR_FINISHING_V1";
const QC_CONTRACT = "AVANTIQO_COLOR_FINISHING_QC_V1";
const QC_SEAL_CONTRACT = "AVANTIQO_COLOR_FINISHING_QC_SEAL_V1";
const OUTPUT_POLICY = "AVANTIQO_SDR_REC709_MASTER_V1";
const supabaseAdmin = getServiceSupabase();

const TARGETS = Object.freeze({
  REC709_SDR: Object.freeze({
    id: "REC709_SDR",
    matrix: "bt709",
    transfer: "bt709",
    primaries: "bt709",
    range: "tv",
    minimum_bit_depth: 8,
    hdr: false,
    output_transform: "FFMPEG_COLORSPACE_BT709",
  }),
  REC2020_PQ: Object.freeze({
    id: "REC2020_PQ",
    matrix: "bt2020nc",
    transfer: "smpte2084",
    primaries: "bt2020",
    range: "tv",
    minimum_bit_depth: 10,
    hdr: true,
    output_transform: "ACES_OR_OCIO_REQUIRED",
  }),
  REC2020_HLG: Object.freeze({
    id: "REC2020_HLG",
    matrix: "bt2020nc",
    transfer: "arib-std-b67",
    primaries: "bt2020",
    range: "tv",
    minimum_bit_depth: 10,
    hdr: true,
    output_transform: "ACES_OR_OCIO_REQUIRED",
  }),
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, limit = 5000) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().slice(0, limit);
  }
  return "";
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = null) {
  const number = finite(value, fallback);
  return number !== null && number > 0 ? number : fallback;
}

function clamp(value, minimum, maximum, fallback) {
  const number = finite(value, fallback);
  return Math.max(minimum, Math.min(maximum, number));
}

function safe(value, fallback = "color-finish") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stable(value[key])]),
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value ?? null)))
    .digest("hex");
}

function extension(profile = {}) {
  const value = text(profile.extension || profile.container || "mp4")
    .replace(/^\./, "")
    .toLowerCase();
  return safe(value || "mp4", "mp4");
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
        finish(new Error("COLOR_FINISHING_TIMEOUT"));
      }, timeoutMs);
    }

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", finish);
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `COLOR_FINISHING_EXIT_${code}`,
        ));
        return;
      }
      finish();
    });
  });
}

function runJson(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let timer = null;
    let settled = false;

    const finish = (error = null, value = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("COLOR_PROBE_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `COLOR_PROBE_EXIT_${code}`,
        ));
        return;
      }
      try {
        finish(null, JSON.parse(Buffer.concat(stdout).toString("utf8")));
      } catch {
        finish(new Error("COLOR_PROBE_INVALID_JSON"));
      }
    });
  });
}

function normalizedColorValue(value) {
  const candidate = text(value, 200).toLowerCase();
  if (!candidate || ["unknown", "unspecified", "reserved", "n/a", "none"].includes(candidate)) {
    return null;
  }
  if (["limited", "mpeg"].includes(candidate)) return "tv";
  if (["full", "jpeg"].includes(candidate)) return "pc";
  return candidate;
}

function colorDescriptor(value = {}) {
  const source = object(value);
  return {
    matrix: normalizedColorValue(
      source.matrix ||
      source.color_space ||
      source.colorspace ||
      source.space,
    ),
    transfer: normalizedColorValue(
      source.transfer ||
      source.color_transfer ||
      source.color_trc ||
      source.trc,
    ),
    primaries: normalizedColorValue(
      source.primaries || source.color_primaries,
    ),
    range: normalizedColorValue(source.range || source.color_range),
    pixel_format: text(source.pixel_format || source.pix_fmt, 200) || null,
    bit_depth: positive(
      source.bit_depth ||
      source.bits_per_raw_sample ||
      source.bits_per_component,
      null,
    ),
  };
}

function completeColor(value = {}) {
  const color = colorDescriptor(value);
  return Boolean(
    color.matrix &&
    color.transfer &&
    color.primaries &&
    color.range,
  );
}

function mergeColor(primary = {}, fallback = {}) {
  const first = colorDescriptor(primary);
  const second = colorDescriptor(fallback);
  return {
    matrix: first.matrix || second.matrix,
    transfer: first.transfer || second.transfer,
    primaries: first.primaries || second.primaries,
    range: first.range || second.range,
    pixel_format: first.pixel_format || second.pixel_format,
    bit_depth: first.bit_depth || second.bit_depth,
  };
}

async function probeColor({ ffprobePath, filePath, timeoutMs }) {
  const result = await runJson(
    ffprobePath,
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries",
      "stream=color_space,color_transfer,color_primaries,color_range,pix_fmt,bits_per_raw_sample,width,height,avg_frame_rate,duration",
      "-of", "json",
      filePath,
    ],
    timeoutMs,
  );
  const stream = list(result.streams)[0] || {};
  return {
    ...colorDescriptor(stream),
    width: positive(stream.width, null),
    height: positive(stream.height, null),
    frame_rate: text(stream.avg_frame_rate, 100) || null,
    duration_seconds: positive(stream.duration, null),
    probe_authority: "FFPROBE_VIDEO_STREAM_V1",
  };
}

function targetFrom({ project, exportProfile }) {
  const projectColor = object(project.metadata?.color_finishing);
  const profileColor = object(
    exportProfile.color_management || exportProfile.colorManagement,
  );
  const requested = text(
    profileColor.target ||
    profileColor.output ||
    exportProfile.color_target ||
    exportProfile.colorTarget ||
    projectColor.target ||
    "REC709_SDR",
    200,
  ).toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  const aliases = {
    REC709: "REC709_SDR",
    SDR: "REC709_SDR",
    SDR_REC709: "REC709_SDR",
    BT709: "REC709_SDR",
    HDR10: "REC2020_PQ",
    PQ: "REC2020_PQ",
    REC2100_PQ: "REC2020_PQ",
    HLG: "REC2020_HLG",
    REC2100_HLG: "REC2020_HLG",
  };
  const key = aliases[requested] || requested;
  const target = TARGETS[key];
  if (!target) throw new Error(`COLOR_TARGET_UNSUPPORTED:${requested}`);
  if (target.hdr) {
    throw new Error(
      `COLOR_HDR_REQUIRES_VERIFIED_ACES_OR_OCIO_OUTPUT_TRANSFORM:${target.id}`,
    );
  }
  return {
    ...target,
    pixel_format: text(
      profileColor.pixel_format ||
      profileColor.pixelFormat ||
      exportProfile.pixel_format ||
      exportProfile.pixelFormat ||
      "yuv420p",
      200,
    ) || "yuv420p",
    policy: OUTPUT_POLICY,
  };
}

function inputOverride({ project, exportProfile }) {
  const projectColor = object(project.metadata?.color_finishing);
  const profileColor = object(
    exportProfile.color_management || exportProfile.colorManagement,
  );
  return colorDescriptor(
    profileColor.input_override ||
    profileColor.inputOverride ||
    exportProfile.color_input_override ||
    exportProfile.colorInputOverride ||
    projectColor.input_override ||
    {},
  );
}

function gradeFrom(value = {}, fallback = {}) {
  const source = object(value);
  const base = object(fallback);
  return {
    brightness: clamp(
      source.brightness ?? base.brightness,
      -0.15,
      0.15,
      0,
    ),
    contrast: clamp(
      source.contrast ?? base.contrast,
      0.75,
      1.35,
      1,
    ),
    saturation: clamp(
      source.saturation ?? base.saturation,
      0.5,
      1.5,
      1,
    ),
    gamma: clamp(
      source.gamma ?? base.gamma,
      0.75,
      1.35,
      1,
    ),
    gamma_r: clamp(
      source.gamma_r ?? source.gammaR ?? base.gamma_r ?? base.gammaR,
      0.75,
      1.35,
      1,
    ),
    gamma_g: clamp(
      source.gamma_g ?? source.gammaG ?? base.gamma_g ?? base.gammaG,
      0.75,
      1.35,
      1,
    ),
    gamma_b: clamp(
      source.gamma_b ?? source.gammaB ?? base.gamma_b ?? base.gammaB,
      0.75,
      1.35,
      1,
    ),
    look_lut_asset_node_id: text(
      source.look_lut_asset_node_id ||
      source.lookLutAssetNodeId ||
      base.look_lut_asset_node_id ||
      base.lookLutAssetNodeId,
      500,
    ) || null,
  };
}

function neutralGrade(grade = {}) {
  return Math.abs(grade.brightness) < 0.0001 &&
    Math.abs(grade.contrast - 1) < 0.0001 &&
    Math.abs(grade.saturation - 1) < 0.0001 &&
    Math.abs(grade.gamma - 1) < 0.0001 &&
    Math.abs(grade.gamma_r - 1) < 0.0001 &&
    Math.abs(grade.gamma_g - 1) < 0.0001 &&
    Math.abs(grade.gamma_b - 1) < 0.0001 &&
    !grade.look_lut_asset_node_id;
}

function projectGrade(project = {}) {
  const color = object(project.metadata?.color_finishing);
  return gradeFrom(
    color.primary_grade || color.primaryGrade || color.grade || color,
  );
}

function shotGrade(shot = {}, projectFallback = {}) {
  const color = object(
    shot.color ||
    shot.color_finishing ||
    shot.metadata?.color_finishing ||
    shot.metadata?.color,
  );
  return gradeFrom(
    color.primary_grade || color.primaryGrade || color.grade || color,
    projectFallback,
  );
}

function shotIdFromTimeline(timeline = {}, edit = {}) {
  const index = Number(edit.requirement_index);
  if (!Number.isInteger(index) || index < 0) return null;
  const requirement = list(timeline.metadata?.requirements)[index];
  return requirement?.shot_id || null;
}

function buildSegments({ timeline, shots, baseRender, project }) {
  const shotMap = new Map(list(shots).map((shot) => [String(shot.id), shot]));
  const baseGrade = projectGrade(project);
  const professional = list(baseRender.metadata?.segment_controls);
  if (professional.length) {
    let cursor = 0;
    return {
      authority: "PROFESSIONAL_FINISHING_SEGMENT_CONTROLS",
      segments: professional.map((entry, index) => {
        const duration = positive(entry.output_duration_seconds, null);
        if (!duration) {
          throw new Error(`COLOR_SEGMENT_DURATION_REQUIRED:${index}`);
        }
        const shot = entry.shot_id
          ? shotMap.get(String(entry.shot_id)) || null
          : null;
        const segment = {
          index,
          shot_id: shot?.id || entry.shot_id || null,
          start_seconds: cursor,
          end_seconds: cursor + duration,
          duration_seconds: duration,
          grade: shotGrade(shot || {}, baseGrade),
        };
        cursor += duration;
        return segment;
      }),
    };
  }

  const edits = list(timeline.metadata?.edit_decision_list);
  if (!edits.length) throw new Error("COLOR_TIMELINE_EDL_REQUIRED");
  return {
    authority: "AVANTIQO_EDL_V1",
    segments: edits.map((edit, index) => {
      const start = finite(edit.timeline_in_seconds, null);
      const end = finite(edit.timeline_out_seconds, null);
      const duration = positive(
        edit.duration_seconds ??
        (start !== null && end !== null ? end - start : null),
        null,
      );
      if (start === null || !duration) {
        throw new Error(`COLOR_TIMELINE_SEGMENT_INVALID:${index}`);
      }
      const shotId = shotIdFromTimeline(timeline, edit);
      const shot = shotId ? shotMap.get(String(shotId)) || null : null;
      return {
        index,
        shot_id: shot?.id || shotId || null,
        start_seconds: start,
        end_seconds: start + duration,
        duration_seconds: duration,
        grade: shotGrade(shot || {}, baseGrade),
      };
    }),
  };
}

function assertSegmentCoverage(segments = [], baseRender = {}) {
  if (!segments.length) throw new Error("COLOR_SEGMENTS_REQUIRED");
  const ordered = [...segments].sort((a, b) => a.start_seconds - b.start_seconds);
  if (ordered[0].start_seconds > 0.05) {
    throw new Error("COLOR_TIMELINE_COVERAGE_START_GAP");
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const gap = ordered[index].start_seconds - ordered[index - 1].end_seconds;
    if (Math.abs(gap) > 0.05) {
      throw new Error(`COLOR_TIMELINE_COVERAGE_GAP:${index}:${gap.toFixed(3)}`);
    }
  }
  const expected = positive(baseRender.technical?.duration_seconds, null);
  if (expected) {
    const actual = ordered.at(-1).end_seconds;
    if (Math.abs(expected - actual) > 0.12) {
      throw new Error(
        `COLOR_TIMELINE_DURATION_MISMATCH:${expected.toFixed(3)}:${actual.toFixed(3)}`,
      );
    }
  }
  return ordered;
}

function escapeFilterPath(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function colorspaceFilter(input, target) {
  return [
    "colorspace",
    `ispace=${input.matrix}`,
    `itrc=${input.transfer}`,
    `iprimaries=${input.primaries}`,
    `irange=${input.range}`,
    `space=${target.matrix}`,
    `trc=${target.transfer}`,
    `primaries=${target.primaries}`,
    `range=${target.range}`,
    "fast=0",
  ].join(":");
}

function gradeFilters(grade = {}, lutPath = null) {
  const filters = [];
  if (!neutralGrade({ ...grade, look_lut_asset_node_id: null })) {
    filters.push(
      `eq=brightness=${grade.brightness}:contrast=${grade.contrast}:saturation=${grade.saturation}:gamma=${grade.gamma}:gamma_r=${grade.gamma_r}:gamma_g=${grade.gamma_g}:gamma_b=${grade.gamma_b}`,
    );
  }
  if (lutPath) {
    filters.push(`lut3d=file='${escapeFilterPath(lutPath)}':interp=tetrahedral`);
  }
  return filters;
}

async function materializeLuts({
  organizationId,
  projectId,
  segments,
  policy,
}) {
  const ids = [...new Set(
    segments
      .map((segment) => segment.grade.look_lut_asset_node_id)
      .filter(Boolean),
  )];
  const bindings = new Map();
  const materials = [];
  try {
    for (const id of ids) {
      const node = await AssetGraphRepository.getById(id);
      if (
        !node ||
        text(node.organization_id) !== text(organizationId) ||
        (node.creative_project_id && text(node.creative_project_id) !== text(projectId)) ||
        !node.url ||
        [CREATIVE_ASSET_NODE_STATUS.REJECTED, CREATIVE_ASSET_NODE_STATUS.ARCHIVED].includes(node.status)
      ) {
        throw new Error(`COLOR_LOOK_LUT_ASSET_INVALID:${id}`);
      }
      if (node.review?.approved !== true && node.status !== CREATIVE_ASSET_NODE_STATUS.APPROVED) {
        throw new Error(`COLOR_LOOK_LUT_NOT_APPROVED:${id}`);
      }
      const extensionValue = path.extname(
        node.metadata?.original_file_name || node.name || node.url,
      ).toLowerCase();
      if (![".cube", ".3dl", ".dat", ".m3d", ".csp"].includes(extensionValue)) {
        throw new Error(`COLOR_LOOK_LUT_FORMAT_UNSUPPORTED:${id}:${extensionValue || "missing"}`);
      }
      const material = await materializeMedia({
        url: node.url,
        file_name: node.metadata?.original_file_name || node.name || `${id}.cube`,
        mime_type: node.technical?.mime_type || null,
        organization_id: organizationId,
        policy,
      });
      materials.push(material);
      const checksum = text(material.checksum || node.technical?.checksum, 500);
      if (!checksum) throw new Error(`COLOR_LOOK_LUT_CHECKSUM_REQUIRED:${id}`);
      bindings.set(id, {
        asset_node_id: node.id,
        file_path: material.file_path,
        checksum,
        name: node.name || null,
      });
    }
    return {
      bindings,
      async cleanup() {
        await Promise.allSettled(materials.map((material) => material.cleanup()));
      },
    };
  } catch (error) {
    await Promise.allSettled(materials.map((material) => material.cleanup()));
    throw error;
  }
}

function buildFilterGraph({ segments, inputColor, target, luts }) {
  const filters = [];
  const labels = [];
  for (const segment of segments) {
    const label = `color${segment.index}`;
    const lut = segment.grade.look_lut_asset_node_id
      ? luts.get(segment.grade.look_lut_asset_node_id)
      : null;
    const chain = [
      `trim=start=${segment.start_seconds}:end=${segment.end_seconds}`,
      "setpts=PTS-STARTPTS",
      colorspaceFilter(inputColor, target),
      ...gradeFilters(segment.grade, lut?.file_path || null),
      `format=pix_fmts=${target.pixel_format}`,
      "setsar=1",
    ];
    filters.push(`[0:v]${chain.join(",")}[${label}]`);
    labels.push(`[${label}]`);
  }
  filters.push(`${labels.join("")}concat=n=${segments.length}:v=1:a=0[colorout]`);
  return filters.join(";");
}

function planIdentity({
  baseRender,
  timeline,
  inputColor,
  target,
  segmentAuthority,
  segments,
  lutBindings,
}) {
  return hash({
    contract: CONTRACT,
    base_render_id: baseRender.id,
    base_checksum: baseRender.technical?.checksum || null,
    timeline_id: timeline.id,
    timeline_identity: timeline.metadata?.timeline_identity || null,
    input_color: inputColor,
    target,
    segment_authority: segmentAuthority,
    segments: segments.map((segment) => ({
      shot_id: segment.shot_id,
      start_seconds: segment.start_seconds,
      end_seconds: segment.end_seconds,
      grade: segment.grade,
      lut_checksum: segment.grade.look_lut_asset_node_id
        ? lutBindings.get(segment.grade.look_lut_asset_node_id)?.checksum || null
        : null,
    })),
  });
}

async function upload({
  organizationId,
  projectId,
  renderId,
  outputPath,
  exportProfile,
  policy,
}) {
  const bucket =
    policy.render_bucket ||
    policy.renderBucket ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("RENDER_STORAGE_BUCKET_REQUIRED");
  const ext = extension(exportProfile);
  const storagePath = [
    safe(organizationId),
    safe(projectId),
    "color-finishing",
    safe(renderId),
    `color-master.${ext}`,
  ].join("/");
  const buffer = await fs.readFile(outputPath);
  const contentType =
    exportProfile.mime_type ||
    exportProfile.mimeType ||
    mime(ext);
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });
  if (error) throw error;
  return {
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    file_size_bytes: buffer.length,
    mime_type: contentType,
  };
}

function colorQc({ outputColor, target, technicalQc, audioIntegrity }) {
  const checks = [
    {
      id: "matrix",
      expected: target.matrix,
      actual: outputColor.matrix,
      passed: outputColor.matrix === target.matrix,
    },
    {
      id: "transfer",
      expected: target.transfer,
      actual: outputColor.transfer,
      passed: outputColor.transfer === target.transfer,
    },
    {
      id: "primaries",
      expected: target.primaries,
      actual: outputColor.primaries,
      passed: outputColor.primaries === target.primaries,
    },
    {
      id: "range",
      expected: target.range,
      actual: outputColor.range,
      passed: outputColor.range === target.range,
    },
    {
      id: "pixel_format",
      expected: target.pixel_format,
      actual: outputColor.pixel_format,
      passed: outputColor.pixel_format === target.pixel_format,
    },
    {
      id: "technical_qc",
      expected: true,
      actual: technicalQc?.passed === true,
      passed: technicalQc?.passed === true,
    },
    {
      id: "master_audio_integrity",
      expected: true,
      actual: audioIntegrity ? audioIntegrity.passed === true : true,
      passed: audioIntegrity ? audioIntegrity.passed === true : true,
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  const base = {
    contract: QC_CONTRACT,
    target_policy: target.policy,
    checks,
    failed_checks: failed.map((check) => check.id),
    actual_rendered_pixels_are_authority: true,
    ffprobe_output_metadata_is_authority: true,
    aggregate_beauty_cannot_override_color_metadata_failure: true,
    audio_stream_copy_requires_integrity_revalidation: true,
    passed: failed.length === 0,
  };
  return {
    ...base,
    qc_hash: hash(base),
  };
}

function inheritedMasterMetadata(baseRender = {}) {
  const metadata = object(baseRender.metadata);
  return {
    master_soundtrack_contract: metadata.master_soundtrack_contract || null,
    master_soundtrack_contract_hash:
      metadata.master_soundtrack_contract_hash || null,
    master_soundtrack_asset_node_id:
      metadata.master_soundtrack_asset_node_id || null,
    master_soundtrack_source_checksum:
      metadata.master_soundtrack_source_checksum || null,
    master_soundtrack_integrity:
      metadata.master_soundtrack_integrity || null,
    master_soundtrack_integrity_passed:
      metadata.master_soundtrack_integrity_passed === true,
    professional_finishing_contract:
      metadata.professional_finishing_contract || null,
    professional_master_audio_lock_contract:
      metadata.professional_master_audio_lock_contract || null,
    professional_final_audio_integrity_contract:
      metadata.professional_final_audio_integrity_contract || null,
  };
}

async function validateMasterAudioAfterColor({
  organizationId,
  baseRender,
  finalRender,
  policy,
}) {
  const sourceId = baseRender.metadata?.master_soundtrack_asset_node_id || null;
  if (!sourceId) return null;
  const source = await AssetGraphRepository.getById(sourceId);
  if (!source || text(source.organization_id) !== text(organizationId)) {
    throw new Error("COLOR_MASTER_SOUNDTRACK_SOURCE_NOT_FOUND");
  }
  return CreativeMasterSoundtrackIntegrityRuntime.validate({
    organization_id: organizationId,
    source_asset_node: source,
    render_asset_node: finalRender,
    expected_duration_seconds:
      baseRender.metadata?.master_soundtrack_integrity?.expected_duration_seconds ||
      source.technical?.duration_seconds ||
      finalRender.technical?.duration_seconds,
    policy,
  });
}

export const CreativeColorFinishingRuntime = Object.freeze({
  contract: CONTRACT,
  qc_contract: QC_CONTRACT,
  qc_seal_contract: QC_SEAL_CONTRACT,
  output_policy: OUTPUT_POLICY,
  supported_targets: TARGETS,
  provider_neutral: true,
  promptless: true,
  aces_or_ocio_not_claimed_without_runtime: true,

  async finish({
    organization_id,
    timeline_asset_node_id,
    base_render,
    export_profile = {},
    policy = {},
    force = false,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!timeline_asset_node_id) throw new Error("timeline_asset_node_id required");
    if (!base_render?.id || !base_render?.url) {
      throw new Error("COLOR_BASE_RENDER_REQUIRED");
    }
    if (text(base_render.organization_id) !== text(organization_id)) {
      throw new Error("COLOR_BASE_RENDER_ORGANIZATION_MISMATCH");
    }

    const timeline = await AssetGraphRepository.getById(timeline_asset_node_id);
    if (!timeline || text(timeline.organization_id) !== text(organization_id)) {
      throw new Error("COLOR_TIMELINE_NOT_FOUND");
    }
    const project = await CreativeProjectRepository.getById(
      timeline.creative_project_id,
    );
    if (!project || text(project.organization_id) !== text(organization_id)) {
      throw new Error("COLOR_PROJECT_NOT_FOUND");
    }
    const shots = await ShotRuntime.list({
      organization_id,
      creative_project_id: timeline.creative_project_id,
    });

    const target = targetFrom({ project, exportProfile: export_profile });
    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    const ffprobePath =
      policy.ffprobe_path ||
      policy.ffprobePath ||
      process.env.CREATIVE_MEDIA_FFPROBE_PATH ||
      null;
    if (!ffmpegPath) throw new Error("COLOR_FFMPEG_NOT_CONFIGURED");
    if (!ffprobePath) throw new Error("COLOR_FFPROBE_NOT_CONFIGURED");
    const timeoutMs = positive(
      policy.render_timeout_ms ||
      policy.renderTimeoutMs ||
      process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS,
      null,
    );
    const probeTimeoutMs = positive(
      policy.probe_timeout_ms ||
      policy.probeTimeoutMs ||
      process.env.CREATIVE_MEDIA_PROBE_TIMEOUT_MS,
      timeoutMs,
    );

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-color-finish-"),
    );
    let source = null;
    let luts = null;
    try {
      source = await materializeMedia({
        url: base_render.url,
        file_name: base_render.name || "base-master.mp4",
        mime_type: base_render.technical?.mime_type || null,
        organization_id,
        policy,
      });
      const probed = await probeColor({
        ffprobePath,
        filePath: source.file_path,
        timeoutMs: probeTimeoutMs,
      });
      const override = inputOverride({ project, exportProfile: export_profile });
      const inputColor = mergeColor(probed, override);
      if (!completeColor(inputColor)) {
        throw new Error(
          `COLOR_INPUT_METADATA_REQUIRED:${JSON.stringify({
            matrix: inputColor.matrix,
            transfer: inputColor.transfer,
            primaries: inputColor.primaries,
            range: inputColor.range,
          })}`,
        );
      }

      const built = buildSegments({
        timeline,
        shots,
        baseRender: base_render,
        project,
      });
      const segments = assertSegmentCoverage(built.segments, base_render);
      luts = await materializeLuts({
        organizationId: organization_id,
        projectId: timeline.creative_project_id,
        segments,
        policy,
      });
      const identity = planIdentity({
        baseRender: base_render,
        timeline,
        inputColor,
        target,
        segmentAuthority: built.authority,
        segments,
        lutBindings: luts.bindings,
      });

      const nodes = await AssetGraphRepository.listByProject({
        organization_id,
        creative_project_id: timeline.creative_project_id,
      });
      const existing = !force
        ? nodes.find((node) =>
            node.type === CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER &&
            node.metadata?.color_finishing_identity === identity &&
            node.metadata?.color_finishing_qc_sealed === true &&
            node.status !== CREATIVE_ASSET_NODE_STATUS.REJECTED,
          )
        : null;
      if (existing) {
        return {
          applicable: true,
          render: existing,
          reused: true,
          input_color: inputColor,
          target,
          segment_authority: built.authority,
          segments,
          color_qc: existing.metadata?.color_finishing_qc || null,
        };
      }

      const filterGraph = buildFilterGraph({
        segments,
        inputColor,
        target,
        luts: luts.bindings,
      });
      const ext = extension(export_profile);
      const outputPath = path.join(directory, `color-master.${ext}`);
      const args = [
        "-y",
        "-i", source.file_path,
        "-filter_complex", filterGraph,
        "-map", "[colorout]",
        "-map", "0:a?",
        "-map", "0:s?",
        "-c:v", String(
          export_profile.video_codec ||
          export_profile.videoCodec ||
          "libx264"
        ),
        "-pix_fmt", target.pixel_format,
        "-colorspace", target.matrix,
        "-color_trc", target.transfer,
        "-color_primaries", target.primaries,
        "-color_range", target.range,
        "-c:a", "copy",
        "-c:s", "copy",
      ];
      if (export_profile.video_bitrate || export_profile.videoBitrate) {
        args.push(
          "-b:v",
          String(export_profile.video_bitrate || export_profile.videoBitrate),
        );
      }
      if (ext === "mp4" || ext === "mov") {
        args.push("-movflags", "+faststart");
      }
      args.push(outputPath);

      await run(ffmpegPath, args, timeoutMs);
      const renderId = crypto.randomUUID();
      const uploaded = await upload({
        organizationId: organization_id,
        projectId: timeline.creative_project_id,
        renderId,
        outputPath,
        exportProfile: export_profile,
        policy,
      });
      const [inspection, outputColor] = await Promise.all([
        CreativeMediaInspectionRuntime.inspect({
          organization_id,
          url: uploaded.url,
          file_name: path.basename(outputPath),
          mime_type: uploaded.mime_type,
          policy,
        }),
        probeColor({
          ffprobePath,
          filePath: outputPath,
          timeoutMs: probeTimeoutMs,
        }),
      ]);
      const profileForQc = {
        ...export_profile,
        width: export_profile.width || base_render.technical?.width,
        height: export_profile.height || base_render.technical?.height,
        frame_rate:
          export_profile.frame_rate ||
          export_profile.frameRate ||
          base_render.technical?.frame_rate ||
          base_render.technical?.fps,
        pixel_format: target.pixel_format,
      };
      const technicalQc = CreativeRenderTechnicalQualityRuntime.evaluate({
        technical: inspection.technical || {},
        profile: profileForQc,
        expected_duration_seconds: base_render.technical?.duration_seconds || null,
        audio_expected:
          Boolean(base_render.technical?.audio_codec) ||
          list(base_render.technical?.streams).some((stream) => stream.codec_type === "audio"),
      });

      const preliminaryNode = createCreativeAssetNode({
        id: renderId,
        organization_id,
        creative_project_id: timeline.creative_project_id,
        parent_asset_node_id: base_render.id,
        type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
        status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
        name: `${base_render.name || "Creative master"} - color finished`,
        description:
          "Governed cinematic color-finished master with explicit input color authority, deterministic output transform, structured primary grade evidence and final color metadata verification.",
        url: uploaded.url,
        storage_path: uploaded.storage_path,
        lineage: {
          source: "governed_color_finishing",
          capability: "creative.color.finish",
          generation_version: 1,
        },
        technical: {
          ...(inspection.technical || {}),
          mime_type: uploaded.mime_type,
          checksum: uploaded.checksum,
          file_size_bytes: uploaded.file_size_bytes,
          color_space: outputColor.matrix,
          color_transfer: outputColor.transfer,
          color_primaries: outputColor.primaries,
          color_range: outputColor.range,
          pixel_format: outputColor.pixel_format || inspection.technical?.pixel_format,
        },
        intelligence: {
          quality_score: null,
          brand_match_score: null,
          reuse_score: null,
          safety_status: "REVIEW_REQUIRED",
          tags: [
            "color-finishing",
            "rec709-master",
            "explicit-color-management",
            "promptless",
          ],
        },
        reuse: {
          reusable: false,
          approved_for_reuse: false,
        },
        review: {
          ai_reviewed: true,
          human_reviewed: false,
          approved: false,
          notes: "Color finishing awaiting deterministic QC seal and final perceptual review.",
        },
        metadata: {
          ...inheritedMasterMetadata(base_render),
          color_finishing_contract: CONTRACT,
          color_finishing_identity: identity,
          color_finishing_output_policy: OUTPUT_POLICY,
          color_finishing_input_authority: inputColor,
          color_finishing_target: target,
          color_finishing_segment_authority: built.authority,
          color_finishing_segments: segments.map((segment) => ({
            index: segment.index,
            shot_id: segment.shot_id,
            start_seconds: segment.start_seconds,
            end_seconds: segment.end_seconds,
            duration_seconds: segment.duration_seconds,
            primary_grade: segment.grade,
            look_lut_checksum: segment.grade.look_lut_asset_node_id
              ? luts.bindings.get(segment.grade.look_lut_asset_node_id)?.checksum || null
              : null,
          })),
          color_finishing_structured_grade_only: true,
          color_finishing_keyword_look_inference_used: false,
          color_finishing_provider_calls_added: 0,
          color_finishing_actual_pixels_created: true,
          color_finishing_output_transform_applied: true,
          color_finishing_requires_final_perceptual_review: true,
          color_finishing_aces_or_ocio_claimed: false,
          color_finishing_locked: false,
          master_audio_modified_by_color_finishing: false,
          base_render_asset_node_id: base_render.id,
          timeline_asset_node_id: timeline.id,
          technical_qc: technicalQc,
          storage_bucket: uploaded.bucket,
          created_at: new Date().toISOString(),
        },
      });
      let render = await AssetGraphRepository.create(preliminaryNode);
      const audioIntegrity = await validateMasterAudioAfterColor({
        organizationId: organization_id,
        baseRender: base_render,
        finalRender: render,
        policy,
      });
      const qc = colorQc({
        outputColor,
        target,
        technicalQc,
        audioIntegrity,
      });
      const sealBase = {
        contract: QC_SEAL_CONTRACT,
        color_finishing_identity: identity,
        input_color_hash: hash(inputColor),
        target_hash: hash(target),
        qc_hash: qc.qc_hash,
        output_checksum: uploaded.checksum,
        actual_output_color: outputColor,
        audio_integrity_hash: audioIntegrity ? hash(audioIntegrity) : null,
      };
      const seal = {
        ...sealBase,
        seal_hash: hash(sealBase),
      };
      render = await AssetGraphRepository.update(render.id, {
        status: qc.passed
          ? CREATIVE_ASSET_NODE_STATUS.REVIEW
          : CREATIVE_ASSET_NODE_STATUS.REJECTED,
        review: {
          ...object(render.review),
          ai_reviewed: true,
          approved: false,
          notes: qc.passed
            ? "Color finishing QC passed; final perceptual/human release review remains required."
            : `Color finishing QC failed: ${qc.failed_checks.join(", ")}`,
        },
        metadata: {
          ...object(render.metadata),
          color_finishing_qc_contract: QC_CONTRACT,
          color_finishing_qc: qc,
          color_finishing_qc_seal_contract: QC_SEAL_CONTRACT,
          color_finishing_qc_seal: qc.passed ? seal : null,
          color_finishing_qc_seal_hash: qc.passed ? seal.seal_hash : null,
          color_finishing_qc_sealed: qc.passed,
          color_finishing_locked: qc.passed,
          master_soundtrack_integrity_after_color_finishing:
            audioIntegrity || null,
          master_soundtrack_integrity_passed_after_color_finishing:
            audioIntegrity ? audioIntegrity.passed === true : true,
          final_master_audio_verified:
            audioIntegrity
              ? audioIntegrity.passed === true
              : base_render.metadata?.final_master_audio_verified === true,
        },
      });
      if (!qc.passed) {
        throw new Error(
          `COLOR_FINISHING_QC_FAILED:${qc.failed_checks.join(",")}`,
        );
      }

      return {
        applicable: true,
        render,
        reused: false,
        input_color: inputColor,
        target,
        segment_authority: built.authority,
        segments,
        color_qc: qc,
        color_qc_seal: seal,
        technical_qc: technicalQc,
        audio_integrity: audioIntegrity,
      };
    } finally {
      if (luts) await luts.cleanup();
      if (source) await source.cleanup();
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
});

export const AVANTIQO_COLOR_FINISHING_CONTRACT = CONTRACT;
export const AVANTIQO_COLOR_FINISHING_QC_CONTRACT = QC_CONTRACT;
export const AVANTIQO_COLOR_FINISHING_QC_SEAL_CONTRACT = QC_SEAL_CONTRACT;
