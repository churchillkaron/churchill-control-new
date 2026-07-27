import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import * as ProductionTaskRepository from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import {
  audioQualityFailures,
  audioQualityPass,
  resolveAudioFinishingContract,
  unwrapAudioOutput,
} from "./AudioFinishingContractRuntime";

const supabaseAdmin = getServiceSupabase();

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function checksum(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function safe(value, fallback = "audio") {
  return text(value || fallback).normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || fallback;
}

async function projectTasks(task) {
  return ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

function executable(task, name, environmentName) {
  return task.input?.media_tools?.[name] || task.metadata?.media_tools?.[name] || process.env[environmentName] || name;
}

function run(command, args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_AUDIO_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolve(output);
      else reject(new Error(output.stderr || `CREATIVE_AUDIO_PROCESS_EXIT_${code}`));
    });
  });
}

async function probe(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error", "-show_entries", "format=duration,format_name,bit_rate:stream=codec_name,codec_type,sample_rate,channels,channel_layout",
    "-of", "json", filePath,
  ], { timeoutMs: 120000 });
  const parsed = JSON.parse(result.stdout || "{}");
  const audio = list(parsed.streams).find((stream) => stream.codec_type === "audio");
  if (!audio) throw new Error("CREATIVE_AUDIO_STREAM_REQUIRED");
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("CREATIVE_AUDIO_DURATION_INVALID");
  return {
    duration_seconds: duration,
    format_name: parsed.format?.format_name || null,
    bit_rate: Number(parsed.format?.bit_rate) || null,
    codec_name: audio.codec_name || null,
    sample_rate: Number(audio.sample_rate) || null,
    channels: Number(audio.channels) || null,
    channel_layout: audio.channel_layout || null,
  };
}

function inputFilter(track, index, probeResult, master) {
  const filters = [];
  const duration = track.duration_seconds || Math.max(0.01, probeResult.duration_seconds - track.trim_start_seconds);
  filters.push(`atrim=start=${track.trim_start_seconds}:duration=${duration}`);
  filters.push("asetpts=PTS-STARTPTS");
  filters.push(`aresample=${master.sample_rate}`);
  filters.push(master.channels === 1 ? "aformat=channel_layouts=mono" : "aformat=channel_layouts=stereo");
  if (track.gain_db) filters.push(`volume=${track.gain_db}dB`);
  if (track.fade_in_seconds > 0) filters.push(`afade=t=in:st=0:d=${track.fade_in_seconds}`);
  if (track.fade_out_seconds > 0) {
    const start = Math.max(0, duration - track.fade_out_seconds);
    filters.push(`afade=t=out:st=${start}:d=${track.fade_out_seconds}`);
  }
  if (track.start_seconds > 0) {
    const delay = Math.round(track.start_seconds * 1000);
    filters.push(`adelay=${delay}|${delay}`);
  }
  return `[${index}:a]${filters.join(",")}[a${index}]`;
}

function deliveryArgs(delivery, sourcePath, outputPath, master) {
  const args = ["-y", "-i", sourcePath, "-ar", String(delivery.sample_rate || master.sample_rate), "-ac", String(delivery.channels || master.channels)];
  switch (delivery.format) {
    case "wav": args.push("-c:a", delivery.codec || "pcm_s24le"); break;
    case "flac": args.push("-c:a", delivery.codec || "flac"); break;
    case "mp3": args.push("-c:a", delivery.codec || "libmp3lame", "-b:a", delivery.bitrate || "320k"); break;
    case "m4a": args.push("-c:a", delivery.codec || "aac", "-b:a", delivery.bitrate || "256k"); break;
    case "ogg": args.push("-c:a", delivery.codec || "libvorbis", "-b:a", delivery.bitrate || "256k"); break;
    case "opus": args.push("-c:a", delivery.codec || "libopus", "-b:a", delivery.bitrate || "192k"); break;
    default: throw new Error(`CREATIVE_AUDIO_DELIVERY_FORMAT_UNSUPPORTED:${delivery.format}`);
  }
  args.push(outputPath);
  return args;
}

function loudnessJson(stderr) {
  const match = String(stderr || "").match(/\{\s*"input_i"[\s\S]*?\}/m);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function analyseLoudness(ffmpeg, filePath) {
  const result = await run(ffmpeg, [
    "-hide_banner", "-nostats", "-i", filePath,
    "-af", "loudnorm=I=-24:LRA=20:TP=-1:print_format=json",
    "-f", "null", "-",
  ], { timeoutMs: 180000 });
  const data = loudnessJson(result.stderr);
  if (!data) throw new Error("CREATIVE_AUDIO_LOUDNESS_ANALYSIS_REQUIRED");
  return {
    integrated_lufs: Number(data.input_i),
    true_peak_dbtp: Number(data.input_tp),
    loudness_range_lu: Number(data.input_lra),
    threshold_lufs: Number(data.input_thresh),
  };
}

async function upload(task, name, buffer, contentType, identity) {
  const bucket = task.input?.storage_policy?.bucket || task.metadata?.storage_policy?.bucket ||
    process.env.CREATIVE_AUDIO_RENDER_BUCKET || process.env.CREATIVE_MEDIA_RENDER_BUCKET || null;
  if (!bucket) throw new Error("CREATIVE_AUDIO_STORAGE_BUCKET_REQUIRED");
  const storagePath = [safe(task.organization_id), safe(task.creative_project_id), "audio", safe(task.metadata?.deliverable_id || task.id), identity, safe(name)].join("/");
  const { error } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, { contentType, upsert: false });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    name,
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: checksum(buffer),
  };
}

function mime(format) {
  return ({ wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg" })[format] || "application/octet-stream";
}

export const CreativeAudioFinishingRuntime = {
  async finish(task) {
    if (!task?.organization_id || !task?.creative_project_id) throw new Error("CREATIVE_AUDIO_CONTEXT_REQUIRED");
    const tasks = await projectTasks(task);
    const contract = resolveAudioFinishingContract(task, tasks);
    const ffmpeg = executable(task, "ffmpeg", "CREATIVE_FFMPEG_PATH");
    const ffprobe = executable(task, "ffprobe", "CREATIVE_FFPROBE_PATH");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-audio-"));
    const materials = [];
    try {
      const probes = [];
      for (let index = 0; index < contract.tracks.length; index += 1) {
        const track = contract.tracks[index];
        if (track.base64) {
          const target = path.join(root, `track-${index + 1}.bin`);
          await fs.writeFile(target, Buffer.from(track.base64.replace(/^data:[^,]+,/, ""), "base64"));
          materials.push({ file_path: target, cleanup: async () => {} });
        } else {
          materials.push(await materializeMedia({
            url: track.url,
            file_name: track.file_name || `track-${index + 1}`,
            mime_type: track.mime_type || null,
            organization_id: task.organization_id,
            policy: contract.media_policy,
          }));
        }
        probes.push(await probe(ffprobe, materials[index].file_path));
      }
      const defaultDeliveries = [
        { id: "master-wav", format: "wav", file_name: "master.wav", bitrate: "", sample_rate: null, channels: null, codec: "", metadata: {} },
        { id: "master-mp3", format: "mp3", file_name: "master.mp3", bitrate: "320k", sample_rate: null, channels: null, codec: "", metadata: {} },
      ];
      const deliveries = contract.deliveries.length ? contract.deliveries : defaultDeliveries;
      const identity = checksum(Buffer.from(JSON.stringify({ contract, sources: probes.map((probeResult, index) => ({ ...probeResult, source_checksum: materials[index].checksum || null })) })));
      const mixPath = path.join(root, "mix.wav");
      const masterPath = path.join(root, "master.wav");
      const inputArgs = materials.flatMap((material) => ["-i", material.file_path]);
      const filters = contract.tracks.map((track, index) => inputFilter(track, index, probes[index], contract.master));
      const labels = contract.tracks.map((_, index) => `[a${index}]`).join("");
      filters.push(`${labels}amix=inputs=${contract.tracks.length}:duration=longest:normalize=0[mix]`);
      await run(ffmpeg, ["-y", ...inputArgs, "-filter_complex", filters.join(";"), "-map", "[mix]", "-ar", String(contract.master.sample_rate), "-ac", String(contract.master.channels), "-c:a", "pcm_f32le", mixPath]);
      await run(ffmpeg, [
        "-y", "-i", mixPath,
        "-af", `loudnorm=I=${contract.master.target_lufs}:LRA=${contract.master.loudness_range_lu}:TP=${contract.master.true_peak_dbtp}:linear=true`,
        "-ar", String(contract.master.sample_rate), "-ac", String(contract.master.channels), "-c:a", "pcm_s24le", masterPath,
      ]);
      const masterProbe = await probe(ffprobe, masterPath);
      const loudness = await analyseLoudness(ffmpeg, masterPath);
      const failures = [];
      if (Math.abs(loudness.integrated_lufs - contract.master.target_lufs) > contract.master.tolerance_lu) failures.push("AUDIO_LOUDNESS_TARGET_MISSED");
      if (loudness.true_peak_dbtp > contract.master.true_peak_dbtp + contract.master.true_peak_tolerance_db) failures.push("AUDIO_TRUE_PEAK_EXCEEDED");
      if (failures.length) throw new Error(`CREATIVE_AUDIO_MASTER_VALIDATION_FAILED:${failures.join(",")}`);
      const waveformPath = path.join(root, "waveform.png");
      await run(ffmpeg, ["-y", "-i", masterPath, "-filter_complex", `showwavespic=s=${contract.waveform.width}x${contract.waveform.height}:colors=white`, "-frames:v", "1", waveformPath], { timeoutMs: 120000 });
      const files = [];
      for (const delivery of deliveries) {
        const outputPath = path.join(root, safe(delivery.file_name, `delivery.${delivery.format}`));
        await run(ffmpeg, deliveryArgs(delivery, masterPath, outputPath, contract.master), { timeoutMs: 300000 });
        const deliveryProbe = await probe(ffprobe, outputPath);
        const buffer = await fs.readFile(outputPath);
        files.push({ ...(await upload(task, path.basename(outputPath), buffer, mime(delivery.format), identity)), probe: deliveryProbe, delivery_id: delivery.id });
      }
      const waveform = await upload(task, "waveform.png", await fs.readFile(waveformPath), "image/png", identity);
      const report = {
        contract: "AVANTIQO_AUDIO_MASTER_REPORT_V1",
        master_id: identity,
        title: contract.title,
        tracks: contract.tracks.map((track, index) => ({ id: track.id, role: track.role, label: track.label, source_task_id: track.source_task_id, source_probe: probes[index] })),
        master: { ...contract.master, ...masterProbe, ...loudness },
        deliveries: files.map((file) => ({ name: file.name, url: file.url, checksum: file.checksum, probe: file.probe })),
        waveform: { url: waveform.url, checksum: waveform.checksum, width: contract.waveform.width, height: contract.waveform.height },
        transcription_required: contract.transcription.required,
        passed: true,
      };
      const reportFile = await upload(task, "master-report.json", Buffer.from(JSON.stringify(report, null, 2)), "application/json", identity);
      const primary = files[0];
      return {
        type: "ASSET",
        name: `${contract.title} mastered audio`,
        url: primary.url,
        file_url: primary.url,
        audio_url: primary.url,
        master_url: primary.url,
        master_id: identity,
        checksum: primary.checksum,
        mime_type: primary.mime_type,
        storage_path: primary.storage_path,
        files: [...files, waveform, reportFile],
        waveform_url: waveform.url,
        master_report: report,
        transcription: contract.transcription,
        release_candidate: true,
      };
    } finally {
      for (const material of materials) await material.cleanup().catch(() => {});
      await fs.rm(root, { recursive: true, force: true });
    }
  },

  async validate(task) {
    const tasks = await projectTasks(task);
    const dependencies = new Set(list(task.depends_on));
    const finishTask = tasks.find((candidate) => dependencies.has(candidate.id) && candidate.metadata?.production_step_id === "finish") ||
      tasks.find((candidate) => candidate.status === "COMPLETED" && candidate.metadata?.audio_finish_for_task_id === task.metadata?.audio_quality_task_id);
    const reviewTask = tasks.find((candidate) => dependencies.has(candidate.id) && candidate.id !== finishTask?.id);
    const finish = object(unwrapAudioOutput(finishTask?.output));
    const review = object(unwrapAudioOutput(reviewTask?.output));
    const failures = [];
    if (!finishTask || finishTask.status !== "COMPLETED") failures.push("AUDIO_FINISHED_MASTER_REQUIRED");
    if (!finish.master_url || !finish.checksum) failures.push("AUDIO_MASTER_ARTIFACT_REQUIRED");
    if (!finish.waveform_url) failures.push("AUDIO_WAVEFORM_REQUIRED");
    if (finish.master_report?.passed !== true) failures.push("AUDIO_MASTER_REPORT_REQUIRED");
    if (!reviewTask || reviewTask.status !== "COMPLETED") failures.push("AUDIO_SEMANTIC_REVIEW_REQUIRED");
    if (!audioQualityPass(review)) failures.push("AUDIO_SEMANTIC_REVIEW_REJECTED");
    failures.push(...audioQualityFailures(review));
    const passed = failures.length === 0;
    return {
      passed,
      success: passed,
      verdict: passed ? "PASS" : "FAIL",
      overall_score: passed ? 100 : 0,
      release_readiness: passed,
      failed_checks: [...new Set(failures)],
      repair_instructions: passed ? [] : ["Repair the audio master, loudness, codec, waveform or semantic-quality failures and rerun finishing."],
      master_url: finish.master_url || null,
      waveform_url: finish.waveform_url || null,
      checksum: finish.checksum || null,
      master_report: finish.master_report || null,
      published: false,
    };
  },
};
