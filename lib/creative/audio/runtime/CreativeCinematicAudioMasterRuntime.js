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
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import * as ProductionTaskRepository
from "@/lib/operations/tasks/repositories/ProductionTaskRepository";
import {
  resolveAudioFinishingContract,
} from "./AudioFinishingContractRuntime";

const CONTRACT = "AVANTIQO_CINEMATIC_AUDIO_MASTER_V1";
const REPORT_CONTRACT = "AVANTIQO_CINEMATIC_AUDIO_MASTER_REPORT_V1";
const QC_CONTRACT = "AVANTIQO_CINEMATIC_AUDIO_MASTER_QC_V1";
const QC_SEAL_CONTRACT = "AVANTIQO_CINEMATIC_AUDIO_MASTER_QC_SEAL_V1";
const LOUDNESS_STANDARD = "ITU_R_BS_1770_5_EBU_R128";
const supabaseAdmin = getServiceSupabase();

const BUS = Object.freeze({
  DIALOGUE: "DIALOGUE",
  MUSIC: "MUSIC",
  EFFECTS: "EFFECTS",
  AMBIENCE: "AMBIENCE",
  PROGRAM: "PROGRAM",
});

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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

function safe(value, fallback = "audio") {
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

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stable(value ?? null)))
    .digest("hex");
}

function fileChecksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function run(command, args, timeoutMs = 600000) {
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

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("CINEMATIC_AUDIO_PROCESS_TIMEOUT"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) finish(null, result);
      else finish(new Error(result.stderr || `CINEMATIC_AUDIO_PROCESS_EXIT_${code}`));
    });
  });
}

function executable(task, kind) {
  const upper = kind.toUpperCase();
  return text(
    task.input?.media_tools?.[kind] ||
    task.metadata?.media_tools?.[kind] ||
    process.env[`CREATIVE_${upper}_PATH`] ||
    process.env[`CREATIVE_MEDIA_${upper}_PATH`],
    1000,
  ) || kind;
}

async function projectTasks(task) {
  return ProductionTaskRepository.listByProject({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
  });
}

function canonicalBus(role) {
  const normalized = text(role, 200).toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if ([
    "dialogue", "dialog", "voice", "speech", "voiceover", "voice_over",
    "narration", "narrator", "adr",
  ].includes(normalized)) return BUS.DIALOGUE;
  if ([
    "music", "score", "song", "soundtrack", "underscore", "bed",
  ].includes(normalized)) return BUS.MUSIC;
  if ([
    "sfx", "fx", "effect", "effects", "sound_effect", "sound_effects",
    "foley", "impact", "impacts",
  ].includes(normalized)) return BUS.EFFECTS;
  if ([
    "ambience", "ambient", "atmosphere", "atmo", "roomtone", "room_tone",
    "environment", "background",
  ].includes(normalized)) return BUS.AMBIENCE;
  return BUS.PROGRAM;
}

function mixSpecification(contract = {}) {
  const spec = object(contract.output_spec);
  const source = {
    ...object(spec.mastering),
    ...object(spec.audio_mix),
    ...object(spec.mix),
  };
  const busGains = object(
    source.bus_gains_db || source.busGainsDb || source.bus_gains,
  );
  const duck = object(source.dialogue_ducking || source.dialogueDucking || source.ducking);
  return {
    dialogue_priority: source.dialogue_priority !== false && source.dialoguePriority !== false,
    bus_gains_db: {
      DIALOGUE: clamp(busGains.DIALOGUE ?? busGains.dialogue, -18, 18, 0),
      MUSIC: clamp(busGains.MUSIC ?? busGains.music, -18, 18, 0),
      EFFECTS: clamp(busGains.EFFECTS ?? busGains.effects ?? busGains.sfx, -18, 18, 0),
      AMBIENCE: clamp(busGains.AMBIENCE ?? busGains.ambience, -18, 18, 0),
      PROGRAM: clamp(busGains.PROGRAM ?? busGains.program, -18, 18, 0),
    },
    dialogue_ducking: {
      enabled: duck.enabled !== false,
      threshold: clamp(duck.threshold, 0.001, 1, 0.05),
      ratio: clamp(duck.ratio, 1, 20, 4),
      attack_ms: clamp(duck.attack_ms ?? duck.attackMs, 1, 1000, 20),
      release_ms: clamp(duck.release_ms ?? duck.releaseMs, 10, 5000, 250),
      makeup: clamp(duck.makeup, 1, 16, 1),
    },
  };
}

function inputTrackFilter(track, index, probe, master) {
  const duration = positive(
    track.duration_seconds,
    Math.max(0.01, probe.duration_seconds - track.trim_start_seconds),
  );
  const filters = [
    `atrim=start=${track.trim_start_seconds}:duration=${duration}`,
    "asetpts=PTS-STARTPTS",
    `aresample=${master.sample_rate}`,
    master.channels === 1
      ? "aformat=sample_fmts=fltp:channel_layouts=mono"
      : "aformat=sample_fmts=fltp:channel_layouts=stereo",
  ];
  if (Math.abs(track.gain_db) > 0.0001) {
    filters.push(`volume=${track.gain_db}dB`);
  }
  if (track.fade_in_seconds > 0) {
    filters.push(`afade=t=in:st=0:d=${track.fade_in_seconds}`);
  }
  if (track.fade_out_seconds > 0) {
    const start = Math.max(0, duration - track.fade_out_seconds);
    filters.push(`afade=t=out:st=${start}:d=${track.fade_out_seconds}`);
  }
  if (track.start_seconds > 0) {
    filters.push(`adelay=${Math.round(track.start_seconds * 1000)}:all=1`);
  }
  return `[${index}:a]${filters.join(",")}[track${index}]`;
}

function buildMixGraph(contract, probes) {
  const mix = mixSpecification(contract);
  const filters = contract.tracks.map((track, index) =>
    inputTrackFilter(track, index, probes[index], contract.master));
  const groups = new Map();
  contract.tracks.forEach((track, index) => {
    const bus = canonicalBus(track.role);
    const values = groups.get(bus) || [];
    values.push(`track${index}`);
    groups.set(bus, values);
  });

  const busLabels = new Map();
  for (const [bus, labels] of groups.entries()) {
    const out = `bus_${bus.toLowerCase()}`;
    const gain = mix.bus_gains_db[bus] || 0;
    const chain = [];
    if (labels.length === 1) {
      chain.push(`[${labels[0]}]anull[${out}_raw]`);
    } else {
      chain.push(
        `${labels.map((label) => `[${label}]`).join("")}amix=inputs=${labels.length}:duration=longest:normalize=0[${out}_raw]`,
      );
    }
    if (Math.abs(gain) > 0.0001) {
      chain.push(`[${out}_raw]volume=${gain}dB[${out}]`);
    } else {
      chain.push(`[${out}_raw]anull[${out}]`);
    }
    filters.push(...chain);
    busLabels.set(bus, out);
  }

  const dialogue = busLabels.get(BUS.DIALOGUE) || null;
  const music = busLabels.get(BUS.MUSIC) || null;
  let finalDialogue = dialogue;
  let finalMusic = music;
  let dialogueDuckingApplied = false;

  if (
    mix.dialogue_priority &&
    mix.dialogue_ducking.enabled &&
    dialogue &&
    music
  ) {
    filters.push(
      `[${dialogue}]asplit=2[dialogue_mix][dialogue_key]`,
      `[${music}][dialogue_key]sidechaincompress=threshold=${mix.dialogue_ducking.threshold}:ratio=${mix.dialogue_ducking.ratio}:attack=${mix.dialogue_ducking.attack_ms}:release=${mix.dialogue_ducking.release_ms}:makeup=${mix.dialogue_ducking.makeup}:detection=rms[music_ducked]`,
    );
    finalDialogue = "dialogue_mix";
    finalMusic = "music_ducked";
    dialogueDuckingApplied = true;
  }

  const finalInputs = [];
  if (finalDialogue) finalInputs.push(finalDialogue);
  if (finalMusic) finalInputs.push(finalMusic);
  for (const bus of [BUS.EFFECTS, BUS.AMBIENCE, BUS.PROGRAM]) {
    const label = busLabels.get(bus);
    if (label) finalInputs.push(label);
  }
  if (!finalInputs.length) throw new Error("CINEMATIC_AUDIO_MIX_BUS_REQUIRED");
  if (finalInputs.length === 1) {
    filters.push(`[${finalInputs[0]}]anull[program_mix]`);
  } else {
    filters.push(
      `${finalInputs.map((label) => `[${label}]`).join("")}amix=inputs=${finalInputs.length}:duration=longest:normalize=0[program_mix]`,
    );
  }

  return {
    filters,
    output_label: "program_mix",
    mix,
    buses: [...groups.entries()].map(([bus, labels]) => ({
      bus,
      track_count: labels.length,
      gain_db: mix.bus_gains_db[bus] || 0,
    })),
    dialogue_present: Boolean(dialogue),
    music_present: Boolean(music),
    dialogue_ducking_applied: dialogueDuckingApplied,
  };
}

async function probe(ffprobe, filePath) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries",
    "format=duration,format_name,bit_rate:stream=codec_name,codec_type,sample_rate,channels,channel_layout,sample_fmt",
    "-of", "json",
    filePath,
  ], 120000);
  const parsed = JSON.parse(result.stdout || "{}");
  const audio = list(parsed.streams).find((stream) => stream.codec_type === "audio");
  if (!audio) throw new Error("CINEMATIC_AUDIO_STREAM_REQUIRED");
  const duration = positive(parsed.format?.duration, null);
  if (!duration) throw new Error("CINEMATIC_AUDIO_DURATION_INVALID");
  return {
    duration_seconds: duration,
    format_name: parsed.format?.format_name || null,
    bit_rate: positive(parsed.format?.bit_rate, null),
    codec_name: audio.codec_name || null,
    sample_fmt: audio.sample_fmt || null,
    sample_rate: positive(audio.sample_rate, null),
    channels: positive(audio.channels, null),
    channel_layout: audio.channel_layout || null,
  };
}

function loudnormJson(stderr) {
  const matches = [...String(stderr || "").matchAll(/\{\s*"input_i"[\s\S]*?\}/gm)];
  const candidate = matches.at(-1)?.[0] || null;
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function measureLoudness(ffmpeg, filePath, master) {
  const result = await run(ffmpeg, [
    "-hide_banner", "-nostats",
    "-i", filePath,
    "-af",
    `loudnorm=I=${master.target_lufs}:LRA=${master.loudness_range_lu}:TP=${master.true_peak_dbtp}:print_format=json`,
    "-f", "null", "-",
  ], 180000);
  const data = loudnormJson(result.stderr);
  if (!data) throw new Error("CINEMATIC_AUDIO_LOUDNESS_MEASUREMENT_REQUIRED");
  const output = {
    integrated_lufs: finite(data.input_i, null),
    true_peak_dbtp: finite(data.input_tp, null),
    loudness_range_lu: finite(data.input_lra, null),
    threshold_lufs: finite(data.input_thresh, null),
    target_offset_lu: finite(data.target_offset, 0),
    normalization_type: text(data.normalization_type, 100) || null,
  };
  if (
    output.integrated_lufs === null ||
    output.true_peak_dbtp === null ||
    output.loudness_range_lu === null ||
    output.threshold_lufs === null
  ) {
    throw new Error("CINEMATIC_AUDIO_LOUDNESS_MEASUREMENT_INCOMPLETE");
  }
  return output;
}

async function twoPassMaster({ ffmpeg, mixPath, masterPath, master, measurement }) {
  const filter = [
    "loudnorm",
    `I=${master.target_lufs}`,
    `LRA=${master.loudness_range_lu}`,
    `TP=${master.true_peak_dbtp}`,
    `measured_I=${measurement.integrated_lufs}`,
    `measured_TP=${measurement.true_peak_dbtp}`,
    `measured_LRA=${measurement.loudness_range_lu}`,
    `measured_thresh=${measurement.threshold_lufs}`,
    `offset=${measurement.target_offset_lu}`,
    "linear=true",
    "print_format=json",
  ].join(":");
  return run(ffmpeg, [
    "-y", "-i", mixPath,
    "-af", `${filter},aresample=${master.sample_rate}`,
    "-ar", String(master.sample_rate),
    "-ac", String(master.channels),
    "-c:a", "pcm_s24le",
    masterPath,
  ], 300000);
}

function deliveryArgs(delivery, sourcePath, outputPath, master) {
  const args = [
    "-y", "-i", sourcePath,
    "-ar", String(delivery.sample_rate || master.sample_rate),
    "-ac", String(delivery.channels || master.channels),
  ];
  switch (delivery.format) {
    case "wav":
      args.push("-c:a", delivery.codec || "pcm_s24le");
      break;
    case "flac":
      args.push("-c:a", delivery.codec || "flac");
      break;
    case "mp3":
      args.push("-c:a", delivery.codec || "libmp3lame", "-b:a", delivery.bitrate || "320k");
      break;
    case "m4a":
      args.push("-c:a", delivery.codec || "aac", "-b:a", delivery.bitrate || "256k");
      break;
    case "ogg":
      args.push("-c:a", delivery.codec || "libvorbis", "-b:a", delivery.bitrate || "256k");
      break;
    case "opus":
      args.push("-c:a", delivery.codec || "libopus", "-b:a", delivery.bitrate || "192k");
      break;
    default:
      throw new Error(`CINEMATIC_AUDIO_DELIVERY_FORMAT_UNSUPPORTED:${delivery.format}`);
  }
  args.push(outputPath);
  return args;
}

function mime(format) {
  return ({
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
  })[format] || "application/octet-stream";
}

async function upload(task, name, buffer, contentType, identity) {
  const bucket =
    task.input?.storage_policy?.bucket ||
    task.metadata?.storage_policy?.bucket ||
    process.env.CREATIVE_AUDIO_RENDER_BUCKET ||
    process.env.CREATIVE_MEDIA_RENDER_BUCKET ||
    null;
  if (!bucket) throw new Error("CINEMATIC_AUDIO_STORAGE_BUCKET_REQUIRED");
  const storagePath = [
    safe(task.organization_id),
    safe(task.creative_project_id),
    "audio-mastering",
    safe(task.metadata?.deliverable_id || task.id),
    identity,
    safe(name),
  ].join("/");
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType, upsert: false });
  if (error && error.statusCode !== "409" && error.status !== 409) throw error;
  return {
    name,
    bucket,
    storage_path: storagePath,
    url: creativeStorageUri(bucket, storagePath),
    mime_type: contentType,
    file_size_bytes: buffer.length,
    checksum: fileChecksum(buffer),
  };
}

async function materializeTracks(task, contract, root) {
  const materials = [];
  try {
    for (let index = 0; index < contract.tracks.length; index += 1) {
      const track = contract.tracks[index];
      if (track.base64) {
        const buffer = Buffer.from(
          track.base64.replace(/^data:[^,]+,/, ""),
          "base64",
        );
        const filePath = path.join(root, `track-${index + 1}.bin`);
        await fs.writeFile(filePath, buffer);
        materials.push({
          file_path: filePath,
          checksum: fileChecksum(buffer),
          mime_type: track.mime_type || null,
          cleanup: async () => {},
        });
      } else {
        materials.push(await materializeMedia({
          url: track.url,
          file_name: track.file_name || `track-${index + 1}`,
          mime_type: track.mime_type || null,
          organization_id: task.organization_id,
          policy: contract.media_policy,
        }));
      }
    }
    return materials;
  } catch (error) {
    await Promise.allSettled(materials.map((material) => material.cleanup()));
    throw error;
  }
}

function qualityEvidence({
  contract,
  preMeasurement,
  postMeasurement,
  masterProbe,
  mixPlan,
  expectedDuration,
}) {
  const checks = [
    {
      id: "integrated_loudness",
      passed:
        Math.abs(postMeasurement.integrated_lufs - contract.master.target_lufs) <=
        contract.master.tolerance_lu,
      expected: `${contract.master.target_lufs} LUFS ± ${contract.master.tolerance_lu} LU`,
      actual: postMeasurement.integrated_lufs,
    },
    {
      id: "true_peak",
      passed:
        postMeasurement.true_peak_dbtp <=
        contract.master.true_peak_dbtp + contract.master.true_peak_tolerance_db,
      expected: `<= ${contract.master.true_peak_dbtp + contract.master.true_peak_tolerance_db} dBTP`,
      actual: postMeasurement.true_peak_dbtp,
    },
    {
      id: "sample_rate",
      passed: masterProbe.sample_rate === contract.master.sample_rate,
      expected: contract.master.sample_rate,
      actual: masterProbe.sample_rate,
    },
    {
      id: "channel_count",
      passed: masterProbe.channels === contract.master.channels,
      expected: contract.master.channels,
      actual: masterProbe.channels,
    },
    {
      id: "duration",
      passed: expectedDuration === null || Math.abs(masterProbe.duration_seconds - expectedDuration) <= 0.1,
      expected: expectedDuration === null ? "SOURCE_DEFINED" : `${expectedDuration}s ± 0.1s`,
      actual: masterProbe.duration_seconds,
    },
    {
      id: "two_pass_loudness_measurement",
      passed: Boolean(preMeasurement && postMeasurement),
      expected: true,
      actual: Boolean(preMeasurement && postMeasurement),
    },
    {
      id: "dialogue_priority",
      passed:
        !mixPlan.dialogue_present ||
        !mixPlan.music_present ||
        !mixPlan.mix.dialogue_priority ||
        mixPlan.dialogue_ducking_applied,
      expected: "Dialogue-triggered music ducking whenever dialogue and music coexist and dialogue priority is enabled",
      actual: mixPlan.dialogue_ducking_applied,
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  const payload = {
    contract: QC_CONTRACT,
    measurement_standard: LOUDNESS_STANDARD,
    actual_rendered_audio_is_authority: true,
    semantic_dialogue_intelligibility_review_required: true,
    two_pass_loudnorm_required: true,
    true_peak_verification_required: true,
    aggregate_score_cannot_override_hard_audio_failure: true,
    checks,
    failed_checks: failed.map((check) => check.id),
    passed: failed.length === 0,
  };
  return {
    ...payload,
    qc_hash: digest(payload),
  };
}

function expectedDuration(contract, probes) {
  let duration = 0;
  contract.tracks.forEach((track, index) => {
    const sourceDuration = probes[index].duration_seconds;
    const usable = positive(
      track.duration_seconds,
      Math.max(0, sourceDuration - track.trim_start_seconds),
    );
    duration = Math.max(duration, track.start_seconds + usable);
  });
  return duration > 0 ? duration : null;
}

export const CreativeCinematicAudioMasterRuntime = Object.freeze({
  contract: CONTRACT,
  report_contract: REPORT_CONTRACT,
  qc_contract: QC_CONTRACT,
  qc_seal_contract: QC_SEAL_CONTRACT,
  loudness_standard: LOUDNESS_STANDARD,
  provider_neutral: true,
  promptless: true,
  stereo_and_mono_mastering_only: true,
  surround_and_object_audio_not_claimed: true,

  async finish(task = {}) {
    if (!task.organization_id || !task.creative_project_id) {
      throw new Error("CINEMATIC_AUDIO_CONTEXT_REQUIRED");
    }
    const tasks = await projectTasks(task);
    const contract = resolveAudioFinishingContract(task, tasks);
    if (![1, 2].includes(contract.master.channels)) {
      throw new Error("CINEMATIC_AUDIO_SURROUND_OR_OBJECT_RUNTIME_REQUIRED");
    }
    const ffmpeg = executable(task, "ffmpeg");
    const ffprobe = executable(task, "ffprobe");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-cinematic-audio-"));
    let materials = [];
    try {
      materials = await materializeTracks(task, contract, root);
      const probes = [];
      for (const material of materials) {
        probes.push(await probe(ffprobe, material.file_path));
      }
      const mixPlan = buildMixGraph(contract, probes);
      const sourceEvidence = contract.tracks.map((track, index) => ({
        id: track.id,
        role: track.role,
        bus: canonicalBus(track.role),
        label: track.label,
        source_task_id: track.source_task_id,
        source_checksum: materials[index].checksum || null,
        source_probe: probes[index],
        timing: {
          start_seconds: track.start_seconds,
          trim_start_seconds: track.trim_start_seconds,
          duration_seconds: track.duration_seconds,
          fade_in_seconds: track.fade_in_seconds,
          fade_out_seconds: track.fade_out_seconds,
        },
        gain_db: track.gain_db,
      }));
      const identity = digest({
        contract: CONTRACT,
        finishing_contract: contract,
        sources: sourceEvidence,
        mix_plan: {
          buses: mixPlan.buses,
          mix: mixPlan.mix,
          dialogue_ducking_applied: mixPlan.dialogue_ducking_applied,
        },
      });
      const inputArgs = materials.flatMap((material) => ["-i", material.file_path]);
      const mixPath = path.join(root, "program-mix-f32.wav");
      await run(ffmpeg, [
        "-y",
        ...inputArgs,
        "-filter_complex", mixPlan.filters.join(";"),
        "-map", `[${mixPlan.output_label}]`,
        "-ar", String(contract.master.sample_rate),
        "-ac", String(contract.master.channels),
        "-c:a", "pcm_f32le",
        mixPath,
      ], 300000);

      const preMeasurement = await measureLoudness(
        ffmpeg,
        mixPath,
        contract.master,
      );
      const masterInternalPath = path.join(root, "master-source-24bit.wav");
      await twoPassMaster({
        ffmpeg,
        mixPath,
        masterPath: masterInternalPath,
        master: contract.master,
        measurement: preMeasurement,
      });
      const [masterProbe, postMeasurement] = await Promise.all([
        probe(ffprobe, masterInternalPath),
        measureLoudness(ffmpeg, masterInternalPath, contract.master),
      ]);
      const duration = expectedDuration(contract, probes);
      const qc = qualityEvidence({
        contract,
        preMeasurement,
        postMeasurement,
        masterProbe,
        mixPlan,
        expectedDuration: duration,
      });
      if (!qc.passed) {
        throw new Error(
          `CINEMATIC_AUDIO_MASTER_QC_FAILED:${qc.failed_checks.join(",")}`,
        );
      }
      const sealPayload = {
        contract: QC_SEAL_CONTRACT,
        master_identity: identity,
        qc_hash: qc.qc_hash,
        source_hash: digest(sourceEvidence),
        mix_hash: digest({
          buses: mixPlan.buses,
          mix: mixPlan.mix,
          dialogue_ducking_applied: mixPlan.dialogue_ducking_applied,
        }),
        pre_loudness_hash: digest(preMeasurement),
        post_loudness_hash: digest(postMeasurement),
      };
      const qcSeal = {
        ...sealPayload,
        seal_hash: digest(sealPayload),
      };

      const defaultDeliveries = [
        {
          id: "master-wav",
          format: "wav",
          file_name: "master.wav",
          bitrate: "",
          sample_rate: contract.master.sample_rate,
          channels: contract.master.channels,
          codec: "pcm_s24le",
          metadata: {},
        },
        {
          id: "review-mp3",
          format: "mp3",
          file_name: "review.mp3",
          bitrate: "320k",
          sample_rate: contract.master.sample_rate,
          channels: contract.master.channels,
          codec: "",
          metadata: {},
        },
      ];
      const deliveries = contract.deliveries.length
        ? contract.deliveries
        : defaultDeliveries;
      const files = [];
      for (let index = 0; index < deliveries.length; index += 1) {
        const delivery = deliveries[index];
        const outputPath = path.join(
          root,
          `delivery-${index + 1}-${safe(delivery.file_name, `delivery.${delivery.format}`)}`,
        );
        await run(
          ffmpeg,
          deliveryArgs(delivery, masterInternalPath, outputPath, contract.master),
          300000,
        );
        const [deliveryProbe, buffer] = await Promise.all([
          probe(ffprobe, outputPath),
          fs.readFile(outputPath),
        ]);
        files.push({
          ...(await upload(
            task,
            delivery.file_name || path.basename(outputPath),
            buffer,
            mime(delivery.format),
            identity,
          )),
          delivery_id: delivery.id,
          probe: deliveryProbe,
        });
      }

      const waveformPath = path.join(root, "waveform.png");
      await run(ffmpeg, [
        "-y", "-i", masterInternalPath,
        "-filter_complex",
        `showwavespic=s=${contract.waveform.width}x${contract.waveform.height}:colors=white`,
        "-frames:v", "1",
        waveformPath,
      ], 120000);
      const waveform = await upload(
        task,
        "waveform.png",
        await fs.readFile(waveformPath),
        "image/png",
        identity,
      );

      const report = {
        contract: REPORT_CONTRACT,
        mastering_contract: CONTRACT,
        qc_contract: QC_CONTRACT,
        qc_seal_contract: QC_SEAL_CONTRACT,
        master_id: identity,
        title: contract.title,
        measurement_standard: LOUDNESS_STANDARD,
        source_stem_count: contract.tracks.length,
        source_stems: sourceEvidence,
        buses: mixPlan.buses,
        mix: {
          dialogue_priority: mixPlan.mix.dialogue_priority,
          dialogue_present: mixPlan.dialogue_present,
          music_present: mixPlan.music_present,
          dialogue_ducking_applied: mixPlan.dialogue_ducking_applied,
          dialogue_ducking: mixPlan.mix.dialogue_ducking,
          bus_gains_db: mixPlan.mix.bus_gains_db,
        },
        master: {
          ...contract.master,
          ...masterProbe,
          integrated_lufs: postMeasurement.integrated_lufs,
          true_peak_dbtp: postMeasurement.true_peak_dbtp,
          loudness_range_lu_measured: postMeasurement.loudness_range_lu,
          threshold_lufs: postMeasurement.threshold_lufs,
          two_pass_normalization: true,
          first_pass_measurement: preMeasurement,
          second_pass_verification: postMeasurement,
          codec: "pcm_s24le",
        },
        qc,
        qc_seal: qcSeal,
        dialogue_intelligibility_semantic_review_required: true,
        semantic_audio_review_required: true,
        no_provider_calls_added: true,
        promptless_execution: true,
        surround_or_object_audio_claimed: false,
        deliveries: files.map((file) => ({
          delivery_id: file.delivery_id,
          name: file.name,
          url: file.url,
          checksum: file.checksum,
          mime_type: file.mime_type,
          probe: file.probe,
        })),
        waveform: {
          url: waveform.url,
          checksum: waveform.checksum,
          width: contract.waveform.width,
          height: contract.waveform.height,
        },
        transcription_required: contract.transcription.required,
        passed: true,
      };
      const reportFile = await upload(
        task,
        "master-report.json",
        Buffer.from(JSON.stringify(report, null, 2)),
        "application/json",
        identity,
      );
      const primary =
        files.find((file) => file.delivery_id === "master-wav") ||
        files.find((file) => file.mime_type === "audio/wav") ||
        files[0];
      if (!primary) throw new Error("CINEMATIC_AUDIO_PRIMARY_DELIVERY_REQUIRED");

      return {
        type: "ASSET",
        name: `${contract.title} cinematic master`,
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
        audio_master_qc_sealed: true,
        audio_master_qc_seal_hash: qcSeal.seal_hash,
        release_candidate: true,
      };
    } finally {
      await Promise.allSettled(materials.map((material) => material.cleanup()));
      await fs.rm(root, { recursive: true, force: true });
    }
  },
});

export const AVANTIQO_CINEMATIC_AUDIO_MASTER_CONTRACT = CONTRACT;
export const AVANTIQO_CINEMATIC_AUDIO_MASTER_REPORT_CONTRACT = REPORT_CONTRACT;
export const AVANTIQO_CINEMATIC_AUDIO_MASTER_QC_CONTRACT = QC_CONTRACT;
export const AVANTIQO_CINEMATIC_AUDIO_MASTER_QC_SEAL_CONTRACT = QC_SEAL_CONTRACT;
