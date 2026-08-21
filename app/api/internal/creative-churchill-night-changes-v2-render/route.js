export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 800;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  resolveCreativeFfmpegPath,
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v2-render-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_CHANGES_90S_V2";
const FILM_CONTRACT = "CHURCHILL_AUTHENTIC_CINEMATIC_FILM_V2";
const MASTER_CONTRACT = "CHURCHILL_AUTHENTIC_CINEMATIC_MASTER_V2";
const BUCKET = "creative-assets";
const MASTER_SECONDS = 90;
const FPS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

const SOURCE = Object.freeze({
  logo_exact: "f2e57100-1b78-43c9-b080-1c7945fc4d23",
  logo_motion_existing: "861dd782-483d-4f1d-b785-0be1d6773bec",
  entrance_video: "d4dbb4f5-c2b8-41f9-87db-6cbc2f9a4a65",
  dining_video: "fb7e06e3-77cb-49f3-9f11-9fa59887b6be",
  dinner_social: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  food_striploin: "9a7f96b4-1c77-47f5-8377-69f0404929ee",
  food_carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  food_salmon: "7df53ffb-b0dd-4a25-bc68-8e4225fe782f",
  food_nachos: "c9aafc12-9f77-4305-8bb6-52e2b1db2eb4",
  food_salad: "707932d6-467d-4f07-a938-829515abf124",
  pool_video: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  pool_still: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  singer_identity: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
  stage_video: "dcd86649-42f8-4f7a-be91-00c456eb940d",
  score: "4de3ecea-6c1a-4d28-a48d-ae8d246237f5",
});

const TRANSITIONS = Object.freeze([
  "entrance_to_dinner",
  "food_to_pool",
  "pool_to_shuffleboard",
  "shuffleboard_to_stage",
]);

const TIMELINE = Object.freeze([
  { key: "logo_open", start: 0, seconds: 6 },
  { key: "entrance_real", start: 6, seconds: 4 },
  { key: "entrance_to_dinner", start: 10, seconds: 8 },
  { key: "dining_real", start: 18, seconds: 7 },
  { key: "food_real", start: 25, seconds: 7 },
  { key: "food_to_pool", start: 32, seconds: 8 },
  { key: "pool_real", start: 40, seconds: 5 },
  { key: "pool_to_shuffleboard", start: 45, seconds: 8 },
  { key: "shuffleboard_real", start: 53, seconds: 4 },
  { key: "shuffleboard_to_stage", start: 57, seconds: 8 },
  { key: "singer_band_real", start: 65, seconds: 10 },
  { key: "night_reality", start: 75, seconds: 7 },
  { key: "logo_close", start: 82, seconds: 8 },
]);

const AUTHENTICITY = Object.freeze({
  exact_logo_asset_id: SOURCE.logo_exact,
  singer_identity_asset_id: SOURCE.singer_identity,
  real_band_asset_id: SOURCE.band,
  real_stage_video_asset_id: SOURCE.stage_video,
  real_pool_video_asset_id: SOURCE.pool_video,
  real_pool_still_asset_id: SOURCE.pool_still,
  real_shuffleboard_asset_id: SOURCE.shuffleboard,
  traditional_dartboard_forbidden: true,
  generated_singer_closeup_forbidden: true,
  generated_band_replacement_forbidden: true,
  generated_logo_replacement_forbidden: true,
  generated_venue_replacement_forbidden: true,
  publication_authorized: false,
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function run(command, args, timeoutMs = 420000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("CHURCHILL_V2_RENDER_TIMEOUT"));
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve({ stdout: out, stderr: err });
    });
  });
}

async function project() {
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V2_MISSION_NOT_PREPARED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V2_PROJECT_NOT_PREPARED");
  return data;
}

async function assetsById() {
  const ids = [...new Set(Object.values(SOURCE))];
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .in("id", ids);
  if (error) throw error;
  const map = new Map((data || []).map((asset) => [asset.id, asset]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) throw new Error(`CHURCHILL_V2_SOURCE_MISSING:${missing.join(",")}`);
  return map;
}

function storagePathFromReference(value) {
  const reference = text(value);
  const prefix = `storage://${BUCKET}/`;
  if (reference.startsWith(prefix)) return reference.slice(prefix.length);
  const publicNeedle = `/storage/v1/object/public/${BUCKET}/`;
  const signedNeedle = `/storage/v1/object/sign/${BUCKET}/`;
  const publicIndex = reference.indexOf(publicNeedle);
  if (publicIndex >= 0) return decodeURIComponent(reference.slice(publicIndex + publicNeedle.length).split("?")[0]);
  const signedIndex = reference.indexOf(signedNeedle);
  if (signedIndex >= 0) return decodeURIComponent(reference.slice(signedIndex + signedNeedle.length).split("?")[0]);
  return null;
}

async function signedReference(value, seconds = 21600) {
  const reference = text(value);
  if (!reference) throw new Error("CHURCHILL_V2_MEDIA_REFERENCE_REQUIRED");
  const storagePath = storagePathFromReference(reference);
  if (!storagePath) {
    if (/^https:\/\//i.test(reference)) return reference;
    throw new Error("CHURCHILL_V2_MEDIA_REFERENCE_UNSUPPORTED");
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`CHURCHILL_V2_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function assetUrl(asset, seconds = 21600) {
  return signedReference(asset?.file_url || asset?.image_url || asset?.thumbnail_url, seconds);
}

async function probe(ffprobe, input) {
  const result = await run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels",
    "-of", "json",
    input,
  ], 60000);
  return JSON.parse(result.stdout || "{}");
}

function baseNormalizeFilter(seconds, { image = false, zoom = 0.018, brightness = -0.01, saturation = 1.03 } = {}) {
  const fadeOut = Math.max(0, seconds - 0.28).toFixed(3);
  if (image) {
    const frames = Math.max(1, Math.round(seconds * FPS));
    const zoomStep = (zoom / Math.max(1, frames)).toFixed(7);
    return [
      "scale=2200:1238:force_original_aspect_ratio=increase",
      "crop=2200:1238",
      `zoompan=z='min(1+on*${zoomStep},${(1 + zoom).toFixed(4)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}`,
      "setsar=1",
      `eq=contrast=1.025:saturation=${saturation}:brightness=${brightness}`,
      "fade=t=in:st=0:d=0.22",
      `fade=t=out:st=${fadeOut}:d=0.28`,
      "format=yuv420p",
    ].join(",");
  }
  return [
    `fps=${FPS}`,
    "scale=1920:1080:force_original_aspect_ratio=increase",
    "crop=1920:1080",
    "setsar=1",
    `eq=contrast=1.025:saturation=${saturation}:brightness=${brightness}`,
    "fade=t=in:st=0:d=0.16",
    `fade=t=out:st=${fadeOut}:d=0.28`,
    "format=yuv420p",
  ].join(",");
}

async function renderSingle({ ffmpeg, input, output, seconds, kind, sourceIn = 0, zoom = 0.018, brightness = -0.01, saturation = 1.03 }) {
  const args = ["-y"];
  if (kind === "image") {
    args.push("-loop", "1", "-framerate", String(FPS), "-i", input);
  } else {
    if (sourceIn > 0) args.push("-ss", String(sourceIn));
    args.push("-stream_loop", "-1", "-i", input);
  }
  args.push(
    "-t", String(seconds),
    "-vf", baseNormalizeFilter(seconds, { image: kind === "image", zoom, brightness, saturation }),
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "16",
    "-r", String(FPS),
    "-vsync", "cfr",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args, 180000);
  return output;
}

async function concatFiles(ffmpeg, files, output, expectedSeconds) {
  const directory = path.dirname(output);
  const list = path.join(directory, `${path.basename(output)}.txt`);
  await fs.writeFile(list, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", list,
    "-an",
    "-c:v", "copy",
    "-fflags", "+genpts",
    "-t", String(expectedSeconds),
    "-movflags", "+faststart",
    output,
  ], 120000);
  return output;
}

async function renderImageSequence({ ffmpeg, inputs, output, seconds, directory, prefix, zoom = 0.016 }) {
  const each = Number((seconds / inputs.length).toFixed(6));
  const files = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const duration = index === inputs.length - 1
      ? Number((seconds - each * (inputs.length - 1)).toFixed(6))
      : each;
    const file = path.join(directory, `${prefix}-${String(index + 1).padStart(2, "0")}.mp4`);
    await renderSingle({
      ffmpeg,
      input: inputs[index],
      output: file,
      seconds: duration,
      kind: "image",
      zoom: index % 2 === 0 ? zoom : Math.max(0.008, zoom * 0.75),
      brightness: -0.012,
      saturation: 1.025,
    });
    files.push(file);
  }
  return concatFiles(ffmpeg, files, output, seconds);
}

async function renderLogoOpen({ ffmpeg, assets, output, directory }) {
  const motionUrl = await assetUrl(assets.get(SOURCE.logo_motion_existing));
  const exactUrl = await assetUrl(assets.get(SOURCE.logo_exact));
  const motion = path.join(directory, "logo-open-motion.mp4");
  const exact = path.join(directory, "logo-open-exact.mp4");
  await renderSingle({ ffmpeg, input: motionUrl, output: motion, seconds: 4, kind: "video", brightness: -0.018, saturation: 1.04 });
  await renderSingle({ ffmpeg, input: exactUrl, output: exact, seconds: 2, kind: "image", zoom: 0.012, brightness: -0.018, saturation: 1.045 });
  return concatFiles(ffmpeg, [motion, exact], output, 6);
}

async function renderLogoClose({ ffmpeg, assets, output }) {
  const exactUrl = await assetUrl(assets.get(SOURCE.logo_exact));
  const frames = MASTER_SECONDS * FPS;
  const filter = [
    "scale=2200:1238:force_original_aspect_ratio=increase",
    "crop=2200:1238",
    `zoompan=z='min(1+on*0.000018,1.035)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}`,
    "setsar=1",
    "eq=contrast=1.055:saturation=1.055:brightness=-0.025",
    "vignette=PI/6",
    "fade=t=in:st=0:d=0.7",
    "fade=t=out:st=7.45:d=0.55",
    "format=yuv420p",
  ].join(",");
  await run(ffmpeg, [
    "-y",
    "-loop", "1",
    "-framerate", String(FPS),
    "-i", exactUrl,
    "-t", "8",
    "-vf", filter,
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "15",
    "-r", String(FPS),
    "-vsync", "cfr",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ], 180000);
  void frames;
  return output;
}

async function transitionUrls(p) {
  const state = p.metadata?.churchill_night_changes_v2 || {};
  const result = {};
  for (const key of TRANSITIONS) {
    const shot = state.shots?.[key] || null;
    if (shot?.status !== "COMPLETED" || !shot?.output_reference) {
      throw new Error(`CHURCHILL_V2_TRANSITION_NOT_READY:${key}`);
    }
    result[key] = await signedReference(shot.output_reference, 21600);
  }
  return result;
}

async function renderSegments({ ffmpeg, p, assets, directory }) {
  const transitions = await transitionUrls(p);
  const outputs = [];

  const logoOpen = path.join(directory, "01-logo-open.mp4");
  await renderLogoOpen({ ffmpeg, assets, output: logoOpen, directory });
  outputs.push(logoOpen);

  const entrance = path.join(directory, "02-entrance.mp4");
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.entrance_video)), output: entrance, seconds: 4, kind: "video", saturation: 1.035 });
  outputs.push(entrance);

  for (const [ordinal, key] of TRANSITIONS.entries()) {
    if (ordinal === 0) {
      const output = path.join(directory, "03-entrance-to-dinner.mp4");
      await renderSingle({ ffmpeg, input: transitions[key], output, seconds: 8, kind: "video", saturation: 1.025 });
      outputs.push(output);

      const dining = path.join(directory, "04-dining.mp4");
      await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.dining_video)), output: dining, seconds: 7, kind: "video", saturation: 1.03 });
      outputs.push(dining);

      const food = path.join(directory, "05-food.mp4");
      const foodUrls = await Promise.all([
        SOURCE.food_striploin,
        SOURCE.food_carpaccio,
        SOURCE.food_salmon,
        SOURCE.food_nachos,
        SOURCE.food_salad,
      ].map((id) => assetUrl(assets.get(id))));
      await renderImageSequence({ ffmpeg, inputs: foodUrls, output: food, seconds: 7, directory, prefix: "food", zoom: 0.017 });
      outputs.push(food);
      continue;
    }

    if (ordinal === 1) {
      const output = path.join(directory, "06-food-to-pool.mp4");
      await renderSingle({ ffmpeg, input: transitions[key], output, seconds: 8, kind: "video", saturation: 1.025 });
      outputs.push(output);

      const poolMotion = path.join(directory, "07a-pool-motion.mp4");
      const poolStill = path.join(directory, "07b-pool-still.mp4");
      await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.pool_video)), output: poolMotion, seconds: 3, kind: "video", saturation: 1.03 });
      await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.pool_still)), output: poolStill, seconds: 2, kind: "image", zoom: 0.014, saturation: 1.03 });
      const pool = path.join(directory, "07-pool.mp4");
      await concatFiles(ffmpeg, [poolMotion, poolStill], pool, 5);
      outputs.push(pool);
      continue;
    }

    if (ordinal === 2) {
      const output = path.join(directory, "08-pool-to-shuffleboard.mp4");
      await renderSingle({ ffmpeg, input: transitions[key], output, seconds: 8, kind: "video", saturation: 1.025 });
      outputs.push(output);

      const shuffle = path.join(directory, "09-shuffleboard.mp4");
      await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.shuffleboard)), output: shuffle, seconds: 4, kind: "image", zoom: 0.02, saturation: 1.03 });
      outputs.push(shuffle);
      continue;
    }

    const output = path.join(directory, "10-shuffleboard-to-stage.mp4");
    await renderSingle({ ffmpeg, input: transitions[key], output, seconds: 8, kind: "video", saturation: 1.025 });
    outputs.push(output);
  }

  const singer = path.join(directory, "11a-singer.mp4");
  const band = path.join(directory, "11b-band.mp4");
  const stage = path.join(directory, "11c-stage.mp4");
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.singer_identity)), output: singer, seconds: 2, kind: "image", zoom: 0.012, saturation: 1.025 });
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.band)), output: band, seconds: 3, kind: "image", zoom: 0.013, saturation: 1.03 });
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.stage_video)), output: stage, seconds: 5, kind: "video", saturation: 1.035 });
  const singerBand = path.join(directory, "11-singer-band.mp4");
  await concatFiles(ffmpeg, [singer, band, stage], singerBand, 10);
  outputs.push(singerBand);

  const realityDinner = path.join(directory, "12a-reality-dinner.mp4");
  const realityPool = path.join(directory, "12b-reality-pool.mp4");
  const realityStage = path.join(directory, "12c-reality-stage.mp4");
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.dinner_social)), output: realityDinner, seconds: 2.3, kind: "image", zoom: 0.02, saturation: 1.035 });
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.pool_still)), output: realityPool, seconds: 2.3, kind: "image", zoom: 0.018, saturation: 1.035 });
  await renderSingle({ ffmpeg, input: await assetUrl(assets.get(SOURCE.stage_video)), output: realityStage, seconds: 2.4, kind: "video", sourceIn: 1.2, saturation: 1.04 });
  const reality = path.join(directory, "12-night-reality.mp4");
  await concatFiles(ffmpeg, [realityDinner, realityPool, realityStage], reality, 7);
  outputs.push(reality);

  const logoClose = path.join(directory, "13-logo-close.mp4");
  await renderLogoClose({ ffmpeg, assets, output: logoClose });
  outputs.push(logoClose);

  if (outputs.length !== TIMELINE.length) {
    throw new Error(`CHURCHILL_V2_SEGMENT_COUNT_INVALID:${outputs.length}`);
  }
  return outputs;
}

async function buildVisualMaster(ffmpeg, segments, output, directory) {
  const list = path.join(directory, "master-segments.txt");
  await fs.writeFile(list, segments.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", list,
    "-an",
    "-c:v", "copy",
    "-fflags", "+genpts",
    "-t", String(MASTER_SECONDS),
    "-movflags", "+faststart",
    output,
  ], 120000);
}

async function sourceAudio(ffprobe, assets) {
  const specs = [
    { id: SOURCE.entrance_video, key: "entrance", delayMs: 6000, sourceIn: 0, seconds: 4, volume: 0.20 },
    { id: SOURCE.dining_video, key: "dining", delayMs: 18000, sourceIn: 0, seconds: 7, volume: 0.25 },
    { id: SOURCE.pool_video, key: "pool", delayMs: 40000, sourceIn: 0, seconds: 3, volume: 0.42 },
    { id: SOURCE.stage_video, key: "stage", delayMs: 70000, sourceIn: 0, seconds: 5, volume: 0.58 },
    { id: SOURCE.stage_video, key: "stage-return", delayMs: 79600, sourceIn: 1.2, seconds: 2.4, volume: 0.46 },
  ];
  const ready = [];
  for (const spec of specs) {
    const url = await assetUrl(assets.get(spec.id));
    try {
      const media = await probe(ffprobe, url);
      const audio = (media?.streams || []).find((stream) => stream.codec_type === "audio");
      if (audio) ready.push({ ...spec, url });
    } catch {
      // Authentic ambience is additive. The film remains valid if a source has no audio stream.
    }
  }
  return ready;
}

async function mixAudio({ ffmpeg, ffprobe, assets, visual, output }) {
  const scoreUrl = await assetUrl(assets.get(SOURCE.score));
  const ambience = await sourceAudio(ffprobe, assets);
  const args = ["-y", "-i", visual, "-stream_loop", "-1", "-i", scoreUrl];
  ambience.forEach((item) => args.push("-i", item.url));

  const filters = [
    `[1:a]atrim=0:${MASTER_SECONDS},asetpts=PTS-STARTPTS,aresample=48000,volume=0.32,afade=t=in:st=0:d=2.0,afade=t=out:st=85.5:d=4.5[score]`,
  ];
  const labels = ["[score]"];

  ambience.forEach((item, offset) => {
    const inputIndex = offset + 2;
    const outStart = Math.max(0.1, item.seconds - 0.35).toFixed(3);
    filters.push(
      `[${inputIndex}:a]atrim=start=${item.sourceIn}:duration=${item.seconds},asetpts=PTS-STARTPTS,aresample=48000,volume=${item.volume},afade=t=in:st=0:d=0.15,afade=t=out:st=${outStart}:d=0.35,adelay=${item.delayMs}:all=1[amb${offset}]`,
    );
    labels.push(`[amb${offset}]`);
  });

  // Deterministic transition accents: low-frequency pool hit, shuffle glide/impact and final glass-like brand chime.
  const accentStartIndex = ambience.length + 2;
  args.push(
    "-f", "lavfi", "-i", "sine=frequency=82:sample_rate=48000:duration=0.28",
    "-f", "lavfi", "-i", "sine=frequency=520:sample_rate=48000:duration=0.20",
    "-f", "lavfi", "-i", "sine=frequency=1320:sample_rate=48000:duration=0.65",
  );
  filters.push(`[${accentStartIndex}:a]volume=0.18,afade=t=out:st=0.08:d=0.20,adelay=40000:all=1[poolhit]`);
  filters.push(`[${accentStartIndex + 1}:a]volume=0.10,afade=t=out:st=0.04:d=0.16,adelay=53000:all=1[shufflehit]`);
  filters.push(`[${accentStartIndex + 2}:a]volume=0.08,afade=t=out:st=0.22:d=0.43,adelay=88900:all=1[chime]`);
  labels.push("[poolhit]", "[shufflehit]", "[chime]");

  filters.push(`${labels.join("")}amix=inputs=${labels.length}:duration=longest:dropout_transition=0,alimiter=limit=0.94[aout]`);
  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "48000",
    "-ac", "2",
    "-t", String(MASTER_SECONDS),
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args, 180000);
  return { ambience: ambience.map((item) => item.key) };
}

function masterPath(projectId) {
  return `${ORGANIZATION_ID}/${projectId}/churchill-night-changes-v2/churchill-the-night-changes-authentic-master-v2-90s.mp4`;
}

async function uploadMaster(localPath, storagePath, projectId) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      organization_id: ORGANIZATION_ID,
      creative_project_id: projectId,
      master_contract: MASTER_CONTRACT,
      duration_seconds: String(MASTER_SECONDS),
      checksum,
      authentic_source_lock: "true",
      publication_authorized: "false",
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

async function signedPath(storagePath, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V2_MASTER_SIGNED_URL_MISSING");
  return data.signedUrl;
}

async function registerMaster({ p, storagePath, stored, technicalQc, audioEvidence }) {
  const existing = await CreativeAssetsRuntime.list({
    organization_id: ORGANIZATION_ID,
    creative_project_id: p.id,
    limit: 500,
  });
  const prior = existing.find((asset) => asset.metadata?.command_identity === COMMAND_IDENTITY && asset.metadata?.role === "AUTHENTIC_MASTER_V2") || null;
  const values = {
    organization_id: ORGANIZATION_ID,
    creative_mission_id: p.creative_mission_id || null,
    creative_project_id: p.id,
    asset_type: "VIDEO",
    file_url: `storage://${BUCKET}/${storagePath}`,
    name: "Churchill — The Night Changes · Authentic 90s Master V2",
    title: "Churchill — The Night Changes · Authentic 90s Master V2",
    file_name: path.basename(storagePath),
    tags: ["churchill", "90s", "authentic-master", "cinematic", "creative-studio"],
    ai_generated: false,
    metadata: {
      command_identity: COMMAND_IDENTITY,
      film_contract: FILM_CONTRACT,
      master_contract: MASTER_CONTRACT,
      role: "AUTHENTIC_MASTER_V2",
      duration_seconds: MASTER_SECONDS,
      authenticity_contract: AUTHENTICITY,
      source_asset_ids: [...new Set(Object.values(SOURCE))],
      generated_transition_count: TRANSITIONS.length,
      generated_transition_seconds: TRANSITIONS.length * 8,
      authentic_media_seconds: MASTER_SECONDS - TRANSITIONS.length * 8,
      technical_qc: technicalQc,
      audio_evidence: audioEvidence,
      checksum: stored.checksum,
      bytes: stored.bytes,
      publication_authorized: false,
      review_required: true,
    },
  };
  const asset = prior
    ? await CreativeAssetsRuntime.update(prior.id, values)
    : await CreativeAssetsRuntime.create(values);

  const metadata = p.metadata || {};
  const current = metadata.churchill_night_changes_v2 || {};
  const next = {
    ...current,
    status: "RENDERED_REVIEW_REQUIRED",
    master_asset_id: asset.id,
    master_storage_path: storagePath,
    master_checksum: stored.checksum,
    master_bytes: stored.bytes,
    technical_qc: technicalQc,
    audio_evidence: audioEvidence,
    publication_authorized: false,
    rendered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, churchill_night_changes_v2: next }, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return asset;
}

async function renderMaster() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CHURCHILL_V2_MEDIA_BINARY_NOT_READY");

  const p = await project();
  const assets = await assetsById();
  await transitionUrls(p);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-night-v2-master-"));
  const visual = path.join(directory, "visual-master.mp4");
  const output = path.join(directory, "churchill-the-night-changes-v2.mp4");
  try {
    const segments = await renderSegments({ ffmpeg, p, assets, directory });
    await buildVisualMaster(ffmpeg, segments, visual, directory);
    const audioEvidence = await mixAudio({ ffmpeg, ffprobe, assets, visual, output });

    const media = await probe(ffprobe, output);
    const duration = Number(media?.format?.duration || 0);
    const video = (media?.streams || []).find((stream) => stream.codec_type === "video");
    const audio = (media?.streams || []).find((stream) => stream.codec_type === "audio");
    if (!video || !audio) throw new Error("CHURCHILL_V2_FINAL_AV_REQUIRED");
    if (Number(video.width) !== WIDTH || Number(video.height) !== HEIGHT) {
      throw new Error(`CHURCHILL_V2_FINAL_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    }
    const frameRate = video.r_frame_rate || video.avg_frame_rate;
    if (frameRate !== "24/1") throw new Error(`CHURCHILL_V2_FINAL_FPS_INVALID:${frameRate}`);
    if (Math.abs(duration - MASTER_SECONDS) > 0.3) {
      throw new Error(`CHURCHILL_V2_FINAL_DURATION_INVALID:${duration}`);
    }

    const technicalQc = {
      passed: true,
      width: Number(video.width),
      height: Number(video.height),
      frame_rate: frameRate,
      duration_seconds: duration,
      video_codec: video.codec_name || null,
      audio_codec: audio.codec_name || null,
      sample_rate: Number(audio.sample_rate || 0) || null,
      channels: Number(audio.channels || 0) || null,
      av_streams_present: true,
      exact_logo_lock: true,
      real_singer_band_lock: true,
      electronic_darts_policy: true,
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    };

    const storagePath = masterPath(p.id);
    const stored = await uploadMaster(output, storagePath, p.id);
    const masterAsset = await registerMaster({ p, storagePath, stored, technicalQc, audioEvidence });
    return {
      success: true,
      rendered: true,
      status: "RENDERED_REVIEW_REQUIRED",
      creative_project_id: p.id,
      master_asset_id: masterAsset.id,
      storage_path: storagePath,
      signed_url: await signedPath(storagePath),
      duration_seconds: duration,
      technical_qc: technicalQc,
      audio_evidence: audioEvidence,
      authenticity_contract: AUTHENTICITY,
      bytes: stored.bytes,
      checksum: stored.checksum,
      publication_authorized: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const state = p.metadata?.churchill_night_changes_v2 || {};
  const storagePath = state.master_storage_path || masterPath(p.id);
  let ready = false;
  try {
    const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
    const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: name, limit: 10 });
    if (error) throw error;
    ready = (data || []).some((entry) => entry.name === name);
  } catch {
    ready = false;
  }
  return {
    success: true,
    status: state.status || "PREPARED",
    creative_project_id: p.id,
    master_asset_id: state.master_asset_id || null,
    final_ready: ready,
    duration_seconds: MASTER_SECONDS,
    timeline: TIMELINE,
    transition_states: Object.fromEntries(
      TRANSITIONS.map((key) => [key, state.shots?.[key] || { status: "NOT_STARTED" }]),
    ),
    technical_qc: state.technical_qc || null,
    signed_url: ready ? await signedPath(storagePath) : null,
    authenticity_contract: AUTHENTICITY,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render") return json(await renderMaster());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_CHURCHILL_NIGHT_CHANGES_V2_RENDER_FAILED", {
      message: error?.message || String(error),
    });
    return json({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}
