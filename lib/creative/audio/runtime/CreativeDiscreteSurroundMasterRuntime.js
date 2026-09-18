import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from
  "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

export const AVANTIQO_DISCRETE_SURROUND_MASTER_CONTRACT =
  "AVANTIQO_DISCRETE_SURROUND_MASTER_V1";

const LAYOUTS = Object.freeze({
  "5.1": Object.freeze(["FL", "FR", "FC", "LFE", "SL", "SR"]),
  "7.1": Object.freeze(["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"]),
  "7.1.4": Object.freeze(["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR", "TFL", "TFR", "TBL", "TBR"]),
});

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function digest(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

function run(command, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = []; const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("SURROUND_RENDER_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8") || "SURROUND_RENDER_FAILED"));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}
async function probe(ffprobe, filePath) {
  const output = await run(ffprobe, [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=channels,sample_rate,channel_layout,codec_name",
    "-of", "json", filePath,
  ], 120000);
  return JSON.parse(output)?.streams?.[0] || {};
}

function normalizeSources(layout, sources) {
  const roles = LAYOUTS[layout];
  if (!roles) throw new Error("SURROUND_LAYOUT_UNSUPPORTED:" + layout);
  const byRole = new Map(list(sources).map((source) => [text(source.role).toUpperCase(), source]));
  const missing = roles.filter((role) => !byRole.has(role));
  if (missing.length) throw new Error("SURROUND_DISCRETE_CHANNEL_SOURCES_REQUIRED:" + missing.join(","));
  return roles.map((role) => ({ ...byRole.get(role), role }));
}

export async function renderDiscreteSurroundMaster({
  organization_id, layout, sources = [], policy = {},
} = {}) {
  if (!organization_id) throw new Error("SURROUND_ORGANIZATION_REQUIRED");
  const normalizedLayout = text(layout);
  const ordered = normalizeSources(normalizedLayout, sources);
  const ffmpeg = resolveCreativeFfmpegPath(policy);
  const ffprobe = resolveCreativeFfprobePath(policy);
  if (!ffmpeg || !ffprobe) throw new Error("SURROUND_FFMPEG_FFPROBE_REQUIRED");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-surround-"));
  const materials = [];
  try {
    for (let index = 0; index < ordered.length; index += 1) {
      const source = ordered[index];
      const media = await materializeMedia({
        organization_id, url: source.url,
        file_name: source.file_name || (source.role + ".wav"),
        mime_type: source.mime_type || "audio/wav", policy,
      });
      const sourceProbe = await probe(ffprobe, media.file_path);
      if (Number(sourceProbe.channels) !== 1) {
        await media.cleanup?.().catch?.(() => {});
        throw new Error("SURROUND_SOURCE_MUST_BE_MONO:" + source.role);
      }
      materials.push({ ...source, media, probe: sourceProbe });
    }
    const inputArgs = materials.flatMap((item) => ["-i", item.media.file_path]);
    const ffmpegLayout = normalizedLayout === "5.1" ? "5.1(side)" : normalizedLayout;
    const map = ordered.map((source, index) => String(index) + ".0-" + source.role).join("|");
    const outputPath = path.join(root, "surround-" + normalizedLayout.replaceAll(".", "_") + ".wav");
    await run(ffmpeg, [
      "-y", ...inputArgs,
      "-filter_complex",
      "join=inputs=" + ordered.length + ":channel_layout=" + ffmpegLayout + ":map=" + map + "[bed]",
      "-map", "[bed]",
      "-ar", "48000",
      "-c:a", "pcm_s24le",
      outputPath,
    ]);

    const outputProbe = await probe(ffprobe, outputPath);
    const buffer = await fs.readFile(outputPath);
    const expectedChannels = ordered.length;
    if (Number(outputProbe.channels) !== expectedChannels) {
      throw new Error("SURROUND_OUTPUT_CHANNEL_COUNT_MISMATCH");
    }
    if (Number(outputProbe.sample_rate) !== 48000) {
      throw new Error("SURROUND_OUTPUT_SAMPLE_RATE_MISMATCH");
    }

    return {
      contract: AVANTIQO_DISCRETE_SURROUND_MASTER_CONTRACT,
      status: "READY",
      layout: normalizedLayout,
      channel_order: ordered.map((source) => source.role),
      channels: expectedChannels,
      sample_rate_hz: 48000,
      bit_depth: 24,
      codec: "pcm_s24le",
      mime_type: "audio/wav",
      buffer, bytes: buffer.length, checksum: digest(buffer),
      probe: outputProbe,
      dolby_atmos_claimed: false,
      object_audio_claimed: false,
      policy: {
        discrete_channel_sources_required: true,
        stereo_upmix_as_surround_master_forbidden: true,
        dolby_atmos_requires_separate_object_metadata_and_renderer: true,
      },
    };
  } finally {
    for (const item of materials) await item.media?.cleanup?.().catch?.(() => {});
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
}
export const CreativeDiscreteSurroundMasterRuntime = Object.freeze({
  contract: AVANTIQO_DISCRETE_SURROUND_MASTER_CONTRACT,
  layouts: LAYOUTS,
  render: renderDiscreteSurroundMaster,
});
