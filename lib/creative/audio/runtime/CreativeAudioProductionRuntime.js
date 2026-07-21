import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";

import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

function runFfmpeg(args = []) {
  if (!ffmpegPath) throw new Error("FFMPEG_RUNTIME_UNAVAILABLE");

  return new Promise((resolve, reject) => {
    const process = spawn(
      ffmpegPath,
      ["-hide_banner", "-loglevel", "error", ...args],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";

    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `FFMPEG_AUDIO_FAILED_${code}: ${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`AUDIO_DOWNLOAD_FAILED_${response.status}`);
  }

  await writeFile(
    target,
    Buffer.from(await response.arrayBuffer()),
  );
}

async function withWorkspace(operation) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "avantiqo-audio-"),
  );

  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function outputUrl(execution = {}) {
  const output = execution?.output?.output || execution?.output || {};

  return (
    output.audio_url ||
    output.url ||
    output.audio?.url ||
    output.audio ||
    null
  );
}

function serviceForRole(role) {
  if (["dialogue", "voiceover"].includes(role)) {
    return "ai.voice.generate";
  }

  if (role === "music") return "ai.music.generate";
  return "ai.sfx.generate";
}

function assetTypeForRole(role) {
  if (["dialogue", "voiceover"].includes(role)) {
    return CREATIVE_ASSET_NODE_TYPES.VOICE;
  }
  if (role === "music") return CREATIVE_ASSET_NODE_TYPES.MUSIC;
  return CREATIVE_ASSET_NODE_TYPES.SFX;
}

function cueText(role, cue = {}) {
  if (["dialogue", "voiceover"].includes(role)) {
    return cue.text || "";
  }

  return [
    cue.description,
    cue.requirement,
    cue.function,
    cue.prompt,
  ].filter(Boolean).join(". ");
}

function cueStart(cue = {}, shotStarts = new Map()) {
  return Math.max(
    0,
    Number(
      cue.start_seconds ??
      cue.timing?.start_seconds ??
      shotStarts.get(cue.shot_id) ??
      0,
    ),
  );
}

function cueDuration(cue = {}, shotDurations = new Map()) {
  return Math.max(
    0.5,
    Number(
      cue.duration_seconds ??
      cue.timing?.duration_seconds ??
      shotDurations.get(cue.shot_id) ??
      5,
    ),
  );
}

function cueKey(role, cue, index) {
  return [
    role,
    cue.shot_id || "film",
    cue.speaker || "",
    index,
  ].join(":");
}

function existingStem(assets, key) {
  return (assets || []).find(
    (asset) =>
      asset.metadata?.audio_key === key &&
      asset.url &&
      [
        CREATIVE_ASSET_NODE_STATUS.GENERATED,
        CREATIVE_ASSET_NODE_STATUS.REVIEW,
        CREATIVE_ASSET_NODE_STATUS.APPROVED,
      ].includes(asset.status),
  ) || null;
}

async function generateStem({
  organization_id,
  creative_project_id,
  role,
  cue,
  index,
  shotStarts,
  shotDurations,
  existingAssets,
}) {
  const key = cueKey(role, cue, index);
  const existing = existingStem(existingAssets, key);

  if (existing) {
    return {
      key,
      role,
      start_seconds: cueStart(cue, shotStarts),
      duration_seconds: cueDuration(cue, shotDurations),
      public_url: existing.url,
      asset: existing,
      reused: true,
    };
  }

  const serviceId = serviceForRole(role);
  const text = cueText(role, cue);
  if (!text.trim()) return null;

  const execution = await ServiceExecutionRuntime.execute({
    organization_id,
    service_id: serviceId,
    operation: `CREATIVE_${role.toUpperCase()}_STEM`,
    input: {
      text,
      prompt: text,
      performance: cue.performance || null,
      emotion: cue.emotion || null,
      voice: cue.voice?.id || cue.voice || null,
      language: cue.language || null,
      duration_seconds: cueDuration(cue, shotDurations),
      direction: cue.direction || cue.function || null,
      instrumentation: cue.instrumentation || null,
      tempo: cue.tempo || null,
      key: cue.key || null,
      environment: cue.location || cue.environment || null,
      action: cue.action || cue.description || null,
      production_contract: "atomic_audio_stems_v1",
    },
    metadata: {
      module: "CREATIVE",
      creative_project_id,
      audio_key: key,
      audio_role: role,
      shot_id: cue.shot_id || null,
      production_contract: "atomic_audio_stems_v1",
    },
    category: "AI",
  });
  const providerUrl = outputUrl(execution);

  if (!providerUrl) {
    throw new Error(`AUDIO_STEM_OUTPUT_MISSING:${key}`);
  }

  const extension = providerUrl.includes(".wav") ? "wav" : "mp3";
  const stored = await CreativeStorageRuntime.uploadFromUrl({
    organization_id,
    creative_project_id,
    asset_id: `audio-${key.replaceAll(":", "-")}`,
    filename: `stem.${extension}`,
    url: providerUrl,
  });
  const asset = await CreativeAssetGraphRuntime.create({
    organization_id,
    creative_project_id,
    type: assetTypeForRole(role),
    status: CREATIVE_ASSET_NODE_STATUS.GENERATED,
    name: `${role} stem ${index + 1}`,
    description: text,
    url: stored.public_url,
    storage_path: stored.storage_path,
    lineage: {
      source: "creative_audio_production",
      provider_id: execution.provider || null,
      capability: serviceId,
      generation_version: 1,
    },
    technical: {
      mime_type: extension === "wav" ? "audio/wav" : "audio/mpeg",
      duration_seconds: cueDuration(cue, shotDurations),
    },
    review: {
      ai_reviewed: false,
      human_reviewed: false,
      approved: false,
      notes: "Generated atomic audio stem awaiting final mix QA.",
    },
    metadata: {
      audio_key: key,
      audio_role: role,
      shot_id: cue.shot_id || null,
      start_seconds: cueStart(cue, shotStarts),
      provider_model: execution.model || null,
      production_contract: "atomic_audio_stems_v1",
      industry_neutral: true,
    },
  });

  return {
    key,
    role,
    start_seconds: cueStart(cue, shotStarts),
    duration_seconds: cueDuration(cue, shotDurations),
    public_url: stored.public_url,
    asset,
    reused: false,
  };
}

async function mixVariant({
  organization_id,
  creative_project_id,
  variant,
  stems,
  totalDuration,
  targetLufs,
}) {
  return withWorkspace(async (directory) => {
    const video = path.join(directory, "picture.mp4");
    await download(variant.public_url, video);

    const args = ["-i", video];
    const filters = [];

    for (let index = 0; index < stems.length; index += 1) {
      const stem = stems[index];
      const file = path.join(directory, `stem-${index}.audio`);
      await download(stem.public_url, file);
      args.push("-i", file);

      const delay = Math.round(stem.start_seconds * 1000);
      const volume = stem.role === "music"
        ? 0.38
        : stem.role === "ambience"
          ? 0.28
          : stem.role === "sfx" || stem.role === "foley"
            ? 0.65
            : 1;
      filters.push(
        `[${index + 1}:a]aresample=48000,adelay=${delay}|${delay},volume=${volume}[a${index}]`,
      );
    }

    const labels = stems.map((_, index) => `[a${index}]`).join("");
    filters.push(
      `${labels}amix=inputs=${stems.length}:duration=longest:dropout_transition=2,` +
      `atrim=0:${Math.max(0.5, totalDuration)},` +
      `loudnorm=I=${targetLufs}:TP=-1:LRA=11[aout]`,
    );

    const output = path.join(directory, "finished-film.mp4");
    await runFfmpeg([
      ...args,
      "-filter_complex", filters.join(";"),
      "-map", "0:v:0",
      "-map", "[aout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "320k",
      "-ar", "48000",
      "-movflags", "+faststart",
      "-shortest",
      output,
    ]);

    const aspect = variant.aspect_ratio || "16:9";
    const stored = await CreativeStorageRuntime.uploadBuffer({
      organization_id,
      creative_project_id,
      asset_id: `sound-finish-${aspect.replace(":", "x")}`,
      filename: `sound-finished-${aspect.replace(":", "x")}.mp4`,
      buffer: await readFile(output),
      content_type: "video/mp4",
    });

    const asset = await CreativeAssetGraphRuntime.create({
      organization_id,
      creative_project_id,
      type: CREATIVE_ASSET_NODE_TYPES.FINAL_RENDER,
      status: CREATIVE_ASSET_NODE_STATUS.REVIEW,
      name: `Sound-Finished Film ${aspect}`,
      description:
        "Picture-finished channel variant with deterministic multistem mix and loudness mastering.",
      url: stored.public_url,
      storage_path: stored.storage_path,
      lineage: {
        source: "creative_audio_mix",
        provider_id: "avantiqo-media-runtime",
        capability: "creative.audio.mix_and_mux",
        generation_version: 1,
      },
      technical: {
        mime_type: "video/mp4",
        duration_seconds: totalDuration,
      },
      review: {
        ai_reviewed: false,
        human_reviewed: false,
        approved: false,
        notes: "Sound finishing complete; final-film QA remains mandatory.",
      },
      metadata: {
        render_key: `sound_finish_${aspect.replace(":", "_")}_v1`,
        render_stage: "SOUND_FINISH",
        aspect_ratio: aspect,
        source_picture_asset_id: variant.asset?.id || null,
        audio_asset_ids: stems.map((stem) => stem.asset?.id).filter(Boolean),
        target_lufs: targetLufs,
        true_peak_dbtp: -1,
        final_film_qa_pending: true,
        industry_neutral: true,
      },
    });

    return {
      aspect_ratio: aspect,
      public_url: stored.public_url,
      storage_path: stored.storage_path,
      asset,
    };
  });
}

export const CreativeAudioProductionRuntime = {
  async produce({
    organization_id,
    creative_project_id,
    package_document,
    picture_finish,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const variants = picture_finish?.variants || [];
    if (!variants.length) throw new Error("PICTURE_VARIANTS_REQUIRED");

    const edit = package_document?.editorial?.edit_decision_list || [];
    const shotStarts = new Map(
      edit.map((item) => [item.shot_id, item.timeline_in_seconds]),
    );
    const shotDurations = new Map(
      edit.map((item) => [item.shot_id, item.duration_seconds]),
    );
    const existingAssets = await CreativeAssetGraphRuntime.list({
      organization_id,
      creative_project_id,
    });
    const stems = [];

    for (const [role, cues] of Object.entries(
      package_document?.audio?.stems || {},
    )) {
      for (let index = 0; index < (cues || []).length; index += 1) {
        const stem = await generateStem({
          organization_id,
          creative_project_id,
          role,
          cue: cues[index],
          index,
          shotStarts,
          shotDurations,
          existingAssets,
        });
        if (stem) stems.push(stem);
      }
    }

    if (!stems.length) {
      throw new Error("AUDIO_STEMS_REQUIRED");
    }

    const totalDuration = Number(
      package_document?.editorial?.total_duration_seconds || 0,
    );
    const targetLufs = Number(
      package_document?.audio?.mix_rules?.loudness_targets?.web_master_lufs ?? -14,
    );
    const outputs = [];

    for (const variant of variants) {
      outputs.push(
        await mixVariant({
          organization_id,
          creative_project_id,
          variant,
          stems,
          totalDuration,
          targetLufs,
        }),
      );
    }

    return {
      stage: "SOUND_FINISH",
      stems,
      variants: outputs,
      audio_mix_pending: false,
      final_film_qa_pending: true,
      industry_neutral: true,
    };
  },
};
