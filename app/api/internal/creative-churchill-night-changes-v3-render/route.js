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
import {
  CHURCHILL_NIGHT_CHANGES_STORY,
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";
import {
  evaluateChurchillV3MasterReadiness,
} from "@/app/api/internal/campaign-story-contracts/churchill-v3-master-readiness";
import {
  CHURCHILL_V3_AGENCY_EDIT_STANDARD,
  CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
  assertChurchillV3AgencyEditStandard,
} from "@/app/api/internal/campaign-story-contracts/churchill-v3-agency-edit-standard";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v3-render-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
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
  pool_video: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  pool_still: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard_real: "4357898f-23fd-418f-af8d-89e3719c0969",
  pool_electronic_darts_real: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
  singer_identity: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
  stage_video: "dcd86649-42f8-4f7a-be91-00c456eb940d",
  score: "4de3ecea-6c1a-4d28-a48d-ae8d246237f5",
});

const DIRECT_APPROVED_VFX = new Set([
  "wine_universe",
  "steam_into_bar",
]);

const BEATS = Object.freeze(CHURCHILL_NIGHT_CHANGES_STORY.canonical_beats.map((item) => ({
  id: item.id,
  seconds: item.target_seconds,
})));

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function text(value) {
  return String(value ?? "").trim();
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
        reject(new Error("CHURCHILL_V3_RENDER_TIMEOUT"));
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
  assertChurchillNightStoryIntegrity();
  assertChurchillV3AgencyEditStandard();
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V3_MISSION_NOT_PREPARED");
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_PROJECT_NOT_PREPARED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function assets() {
  const ids = [...new Set(Object.values(SOURCE))];
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .in("id", ids);
  if (error) throw error;
  const map = new Map((data || []).map((item) => [item.id, item]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) throw new Error(`CHURCHILL_V3_SOURCE_MISSING:${missing.join(",")}`);
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
  if (!reference) throw new Error("CHURCHILL_V3_MEDIA_REFERENCE_REQUIRED");
  const storagePath = storagePathFromReference(reference);
  if (!storagePath) {
    if (/^https:\/\//i.test(reference)) return reference;
    throw new Error("CHURCHILL_V3_MEDIA_REFERENCE_UNSUPPORTED");
  }
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V3_SIGNED_URL_MISSING");
  return data.signedUrl;
}

async function assetUrl(asset) {
  return signedReference(asset?.file_url || asset?.image_url || asset?.thumbnail_url);
}

function normalizeFilter(seconds, image = false, zoom = 0.016) {
  const fadeOut = Math.max(0, seconds - 0.2).toFixed(3);
  if (image) {
    const frames = Math.max(1, Math.round(seconds * FPS));
    const step = (zoom / frames).toFixed(7);
    return `scale=2200:1238:force_original_aspect_ratio=increase,crop=2200:1238,zoompan=z='min(1+on*${step},${(1 + zoom).toFixed(4)})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS},setsar=1,eq=contrast=1.03:saturation=1.025:brightness=-0.01,fade=t=in:st=0:d=0.12,fade=t=out:st=${fadeOut}:d=0.2,format=yuv420p`;
  }
  return `fps=${FPS},scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,eq=contrast=1.025:saturation=1.02:brightness=-0.008,fade=t=in:st=0:d=0.10,fade=t=out:st=${fadeOut}:d=0.2,format=yuv420p`;
}

async function renderOne(ffmpeg, input, output, seconds, kind = "video", sourceIn = 0) {
  const args = ["-y"];
  if (kind === "image") args.push("-loop", "1", "-framerate", String(FPS));
  if (kind === "video" && sourceIn > 0) args.push("-ss", String(sourceIn));
  if (kind === "video") args.push("-stream_loop", "-1");
  args.push("-i", input, "-t", String(seconds), "-vf", normalizeFilter(seconds, kind === "image"), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-r", String(FPS), "-vsync", "cfr", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  await run(ffmpeg, args, 180000);
  return output;
}

async function renderPortraitMotion(ffmpeg, input, output, seconds, sourceIn = 0) {
  const fadeOut = Math.max(0, seconds - 0.12).toFixed(3);
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push("-stream_loop", "-1", "-i", input);
  const filter = [
    `[0:v]fps=${FPS},split=2[bgsrc][fgsrc]`,
    `[bgsrc]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},gblur=sigma=28,eq=contrast=1.02:saturation=0.88:brightness=-0.035[bg]`,
    `[fgsrc]scale=-2:1010:force_original_aspect_ratio=decrease,setsar=1[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=0.08,fade=t=out:st=${fadeOut}:d=0.12,format=yuv420p[out]`,
  ].join(";");
  args.push("-t", String(seconds), "-filter_complex", filter, "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-r", String(FPS), "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  await run(ffmpeg, args, 180000);
  return output;
}

async function concat(ffmpeg, files, output, seconds) {
  const list = `${output}.txt`;
  await fs.writeFile(list, files.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", "-fflags", "+genpts", "-t", String(seconds), "-movflags", "+faststart", output], 120000);
  return output;
}

async function sequence(ffmpeg, urls, seconds, directory, prefix) {
  const each = seconds / urls.length;
  const parts = [];
  for (let i = 0; i < urls.length; i += 1) {
    const duration = i === urls.length - 1 ? seconds - each * (urls.length - 1) : each;
    const file = path.join(directory, `${prefix}-${i + 1}.mp4`);
    await renderOne(ffmpeg, urls[i], file, duration, "image");
    parts.push(file);
  }
  const output = path.join(directory, `${prefix}.mp4`);
  return concat(ffmpeg, parts, output, seconds);
}

function completedReference(node) {
  return node?.status === "COMPLETED" && node?.output_reference ? node.output_reference : null;
}

function repairState(p) {
  const original = p.metadata?.churchill_v3_vfx?.shots || {};
  const r1 = p.metadata?.churchill_v3_repairs?.generations || {};
  const r2 = p.metadata?.churchill_v3_repairs_r2?.generations || {};
  const r2b = p.metadata?.churchill_v3_dart_r2b?.generations || {};
  const editorial = p.metadata?.churchill_v3_editorial || {};
  return { original, r1, r2, r2b, editorial };
}

async function mediaOutputs(p) {
  const state = repairState(p);
  const output = { original: {}, r1: {}, r2: {}, r2b: {}, editorial: {} };

  for (const key of DIRECT_APPROVED_VFX) {
    const reference = completedReference(state.original[key]);
    if (!reference) throw new Error(`CHURCHILL_V3_APPROVED_VFX_NOT_READY:${key}`);
    output.original[key] = await signedReference(reference);
  }

  for (const [key, node] of Object.entries(state.r1)) {
    const reference = completedReference(node);
    if (reference) output.r1[key] = await signedReference(reference);
  }
  for (const [key, node] of Object.entries(state.r2)) {
    const reference = completedReference(node);
    if (reference) output.r2[key] = await signedReference(reference);
  }
  for (const [key, node] of Object.entries(state.r2b)) {
    const reference = completedReference(node);
    if (reference) output.r2b[key] = await signedReference(reference);
  }
  for (const [key, node] of Object.entries(state.editorial.outputs || {})) {
    if (node?.approved_for_master === true && node?.visual_review_complete === true && node?.output_reference) {
      output.editorial[key] = await signedReference(node.output_reference);
    }
  }

  return { state, output };
}

function masterReadiness(p) {
  assertChurchillV3AgencyEditStandard();
  const state = repairState(p);
  const editorial = state.editorial || {};
  return evaluateChurchillV3MasterReadiness({
    canonical_story_version: p.metadata?.canonical_story_version,
    real_shuffleboard_asset_id: SOURCE.shuffleboard_real,
    real_pool_electronic_darts_asset_id: SOURCE.pool_electronic_darts_real,
    exact_logo_asset_id: SOURCE.logo_exact,
    asset_ids: Object.values(SOURCE),
    approvals: {
      wine_universe: true,
      steam_into_bar: true,
    },
    repairs: {
      ice_time_freeze_authentic_pool_landing: editorial.ice_time_freeze_authentic_pool_landing === true,
      shuffleboard_to_dart_editorial_match_cut: editorial.shuffleboard_to_dart_editorial_match_cut === true,
      electric_dart_flight_authentic_electronic_darts: editorial.electric_dart_flight_authentic_electronic_darts === true,
      frozen_night_hero_authentic_composite: editorial.frozen_night_hero_authentic_composite === true,
      wine_loop_return_authentic_payoff: editorial.wine_loop_return_authentic_payoff === true,
      sound_design_grammar: editorial.sound_design_grammar === true,
    },
    generated_people_present: editorial.generated_people_present === true,
    traditional_dartboard_present: editorial.traditional_dartboard_present === true,
    generic_venue_replacement_present: editorial.generic_venue_replacement_present === true,
    old_r1_dart_final: editorial.old_r1_dart_final === true,
    old_r1_frozen_hero_final: editorial.old_r1_frozen_hero_final === true,
    master_duration_seconds: MASTER_SECONDS,
    visual_review_complete: editorial.visual_review_complete === true,
    sound_review_complete: editorial.sound_review_complete === true,
    publication_authorized: false,
  });
}

async function renderManyRealities({ ffmpeg, assetsById, media, directory, seconds }) {
  if (!media.r1.shuffleboard_motion) throw new Error("CHURCHILL_V3_MANY_REALITIES_APPROVED_SHUFFLEBOARD_MOTION_REQUIRED");
  const dining = await assetUrl(assetsById.get(SOURCE.dining_video));
  const pool = await assetUrl(assetsById.get(SOURCE.pool_video));
  const stage = await assetUrl(assetsById.get(SOURCE.stage_video));
  const cuts = [
    { url: dining, seconds: 0.90, sourceIn: 0.35, portrait: true },
    { url: pool, seconds: 0.80, sourceIn: 0.15, portrait: true },
    { url: stage, seconds: 0.75, sourceIn: 0.55, portrait: true },
    { url: media.r1.shuffleboard_motion, seconds: 0.70, sourceIn: 0, portrait: false },
    { url: dining, seconds: 0.85, sourceIn: 2.20, portrait: true },
    { url: pool, seconds: 0.90, sourceIn: 1.65, portrait: true },
    { url: stage, seconds: 1.10, sourceIn: 2.45, portrait: true },
  ];
  const total = cuts.reduce((sum, cut) => sum + cut.seconds, 0);
  if (Math.abs(total - seconds) > 0.001) throw new Error(`CHURCHILL_V3_MANY_REALITIES_DURATION_INVALID:${total}`);
  const files = [];
  for (let index = 0; index < cuts.length; index += 1) {
    const cut = cuts[index];
    const file = path.join(directory, `many-realities-motion-${index + 1}.mp4`);
    if (cut.portrait) await renderPortraitMotion(ffmpeg, cut.url, file, cut.seconds, cut.sourceIn);
    else await renderOne(ffmpeg, cut.url, file, cut.seconds, "video", cut.sourceIn);
    files.push(file);
  }
  return concat(ffmpeg, files, path.join(directory, "many-realities-authentic-motion.mp4"), seconds);
}

async function renderBeat({ ffmpeg, beat, assetsById, media, directory }) {
  const output = path.join(directory, `${beat.id}.mp4`);

  if (DIRECT_APPROVED_VFX.has(beat.id)) {
    return renderOne(ffmpeg, media.original[beat.id], output, beat.seconds, "video");
  }

  if (beat.id === "logo_prologue") {
    const a = path.join(directory, "logo-prologue-motion.mp4");
    const b = path.join(directory, "logo-prologue-still.mp4");
    await renderOne(ffmpeg, await assetUrl(assetsById.get(SOURCE.logo_motion_existing)), a, 3.2, "video");
    await renderOne(ffmpeg, await assetUrl(assetsById.get(SOURCE.logo_exact)), b, 1.8, "image", 0);
    return concat(ffmpeg, [a, b], output, beat.seconds);
  }
  if (beat.id === "entrance_into_night") {
    return renderPortraitMotion(ffmpeg, await assetUrl(assetsById.get(SOURCE.entrance_video)), output, beat.seconds, 0);
  }
  if (beat.id === "dinner_future_reflections") {
    const motion = path.join(directory, "dinner-motion.mp4");
    const details = path.join(directory, "dinner-details.mp4");
    await renderPortraitMotion(ffmpeg, await assetUrl(assetsById.get(SOURCE.dining_video)), motion, 4.4, 0);
    await sequence(
      ffmpeg,
      await Promise.all([SOURCE.food_striploin, SOURCE.food_carpaccio, SOURCE.food_salmon].map((id) => assetUrl(assetsById.get(id)))),
      2.6,
      directory,
      "dinner-detail-sequence",
    );
    await fs.rename(path.join(directory, "dinner-detail-sequence.mp4"), details);
    return concat(ffmpeg, [motion, details], output, beat.seconds);
  }
  if (beat.id === "ice_time_freeze") {
    const approved = media.editorial.ice_time_freeze_authentic_pool_landing;
    if (!approved) throw new Error("CHURCHILL_V3_FINAL_ICE_COMPOSITE_REQUIRED");
    return renderOne(ffmpeg, approved, output, beat.seconds, "video");
  }
  if (beat.id === "pool_activation") {
    return renderPortraitMotion(ffmpeg, await assetUrl(assetsById.get(SOURCE.pool_video)), output, beat.seconds, 0);
  }
  if (beat.id === "pool_to_shuffleboard") {
    if (!media.r1.shuffleboard_motion) throw new Error("CHURCHILL_V3_APPROVED_SHUFFLEBOARD_MOTION_REQUIRED");
    return renderOne(ffmpeg, media.r1.shuffleboard_motion, output, beat.seconds, "video");
  }
  if (beat.id === "shuffleboard_to_dart") {
    const approved = media.editorial.shuffleboard_to_dart_editorial_match_cut;
    if (!approved) throw new Error("CHURCHILL_V3_FINAL_SHUFFLEBOARD_DART_EDIT_REQUIRED");
    return renderOne(ffmpeg, approved, output, beat.seconds, "video");
  }
  if (beat.id === "electric_dart_flight") {
    const approved = media.editorial.electric_dart_flight_authentic_electronic_darts;
    if (!approved) throw new Error("CHURCHILL_V3_FINAL_ELECTRONIC_DART_EDIT_REQUIRED");
    return renderOne(ffmpeg, approved, output, beat.seconds, "video");
  }
  if (beat.id === "band_activates_churchill") {
    return renderPortraitMotion(ffmpeg, await assetUrl(assetsById.get(SOURCE.stage_video)), output, beat.seconds, 0);
  }
  if (beat.id === "many_realities_same_night") {
    const montage = await renderManyRealities({ ffmpeg, assetsById, media, directory, seconds: beat.seconds });
    await fs.rename(montage, output);
    return output;
  }
  if (beat.id === "frozen_night_hero") {
    const approved = media.editorial.frozen_night_hero_authentic_composite;
    if (!approved) throw new Error("CHURCHILL_V3_FINAL_FROZEN_HERO_COMPOSITE_REQUIRED");
    return renderOne(ffmpeg, approved, output, beat.seconds, "video");
  }
  if (beat.id === "wine_loop_return") {
    const approved = media.editorial.wine_loop_return_authentic_payoff;
    if (!approved) throw new Error("CHURCHILL_V3_FINAL_WINE_LOOP_PAYOFF_REQUIRED");
    return renderOne(ffmpeg, approved, output, beat.seconds, "video");
  }
  if (beat.id === "logo_epilogue") {
    const motion = path.join(directory, "logo-epilogue-motion.mp4");
    const exact = path.join(directory, "logo-epilogue-exact.mp4");
    await renderOne(ffmpeg, await assetUrl(assetsById.get(SOURCE.logo_motion_existing)), motion, 4.0, "video");
    await renderOne(ffmpeg, await assetUrl(assetsById.get(SOURCE.logo_exact)), exact, 4.0, "image", 0);
    return concat(ffmpeg, [motion, exact], output, beat.seconds);
  }
  throw new Error(`CHURCHILL_V3_BEAT_RENDERER_MISSING:${beat.id}`);
}

async function mixMasterAudio(ffmpeg, visual, assetsById, master) {
  const scoreUrl = await assetUrl(assetsById.get(SOURCE.score));
  const entranceUrl = await assetUrl(assetsById.get(SOURCE.entrance_video));
  const diningUrl = await assetUrl(assetsById.get(SOURCE.dining_video));
  const poolUrl = await assetUrl(assetsById.get(SOURCE.pool_video));
  const stageUrl = await assetUrl(assetsById.get(SOURCE.stage_video));
  const filter = [
    `[1:a]atrim=0:${MASTER_SECONDS},asetpts=PTS-STARTPTS,aresample=48000,volume=0.32,volume=0.12:enable='between(t,56.2,56.9)',afade=t=in:st=0:d=1.5,afade=t=out:st=86:d=4[score]`,
    `[2:a]atrim=0:5,asetpts=PTS-STARTPTS,aresample=48000,volume=0.17,adelay=5000|5000[entrance]`,
    `[3:a]atrim=0:7,asetpts=PTS-STARTPTS,aresample=48000,volume=0.20,adelay=17000|17000[dining]`,
    `[4:a]atrim=0:6,asetpts=PTS-STARTPTS,aresample=48000,volume=0.24,adelay=36000|36000[pool]`,
    `[5:a]atrim=0:13,asetpts=PTS-STARTPTS,aresample=48000,volume=0.40,adelay=58000|58000[stage]`,
    `[score][entrance][dining][pool][stage]amix=inputs=5:duration=longest:dropout_transition=0,alimiter=limit=0.94[aout]`,
  ].join(";");
  await run(ffmpeg, [
    "-y",
    "-i", visual,
    "-stream_loop", "-1", "-i", scoreUrl,
    "-stream_loop", "-1", "-i", entranceUrl,
    "-stream_loop", "-1", "-i", diningUrl,
    "-stream_loop", "-1", "-i", poolUrl,
    "-stream_loop", "-1", "-i", stageUrl,
    "-filter_complex", filter,
    "-map", "0:v:0",
    "-map", "[aout]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "48000",
    "-ac", "2",
    "-t", String(MASTER_SECONDS),
    "-movflags", "+faststart",
    master,
  ], 180000);
  return master;
}

async function probe(ffprobe, input) {
  const result = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,sample_rate,channels", "-of", "json", input], 60000);
  return JSON.parse(result.stdout || "{}");
}

async function register({ p, target, bytes, checksum, qc }) {
  const existing = await CreativeAssetsRuntime.list({ organization_id: ORGANIZATION_ID, creative_project_id: p.id, limit: 500 });
  const prior = existing.find((item) => item.metadata?.command_identity === COMMAND_IDENTITY && item.metadata?.role === "CANONICAL_MASTER_V3") || null;
  const values = {
    organization_id: ORGANIZATION_ID,
    creative_mission_id: p.creative_mission_id,
    creative_project_id: p.id,
    asset_type: "VIDEO",
    file_url: `storage://${BUCKET}/${target}`,
    name: "Churchill — The Night Inside The Night · 90s Canonical Master V3",
    title: "Churchill — The Night Inside The Night · 90s Canonical Master V3",
    file_name: path.basename(target),
    tags: ["churchill", "90s", "canonical-story-v4", "worldclass", "creative-studio"],
    ai_generated: false,
    metadata: {
      command_identity: COMMAND_IDENTITY,
      role: "CANONICAL_MASTER_V3",
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      agency_edit_standard_version: CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
      story_locked: true,
      story_change_authorized: false,
      source_asset_ids: [...new Set(Object.values(SOURCE))],
      direct_approved_vfx: [...DIRECT_APPROVED_VFX],
      duration_seconds: MASTER_SECONDS,
      technical_qc: qc,
      checksum,
      bytes,
      review_required: true,
      publication_authorized: false,
    },
  };
  return prior ? CreativeAssetsRuntime.update(prior.id, values) : CreativeAssetsRuntime.create(values);
}

async function render() {
  assertChurchillNightStoryIntegrity();
  assertChurchillV3AgencyEditStandard();
  const p = await project();
  const readiness = masterReadiness(p);
  if (!readiness.ready) {
    throw new Error(`CHURCHILL_V3_MASTER_BLOCKED:${readiness.failures.join("|")}`);
  }

  const assetsById = await assets();
  const { output: media } = await mediaOutputs(p);
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CHURCHILL_V3_MEDIA_BINARIES_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v3-"));
  const visual = path.join(directory, "visual.mp4");
  const master = path.join(directory, "churchill-v3-master.mp4");
  try {
    const files = [];
    for (const beat of BEATS) files.push(await renderBeat({ ffmpeg, beat, assetsById, media, directory }));
    await concat(ffmpeg, files, visual, MASTER_SECONDS);
    await mixMasterAudio(ffmpeg, visual, assetsById, master);

    const mediaInfo = await probe(ffprobe, master);
    const duration = Number(mediaInfo?.format?.duration || 0);
    const video = (mediaInfo?.streams || []).find((stream) => stream.codec_type === "video");
    const audio = (mediaInfo?.streams || []).find((stream) => stream.codec_type === "audio");
    if (!video || !audio) throw new Error("CHURCHILL_V3_AV_REQUIRED");
    if (Number(video.width) !== WIDTH || Number(video.height) !== HEIGHT) throw new Error(`CHURCHILL_V3_DIMENSIONS_INVALID:${video.width}x${video.height}`);
    if ((video.r_frame_rate || video.avg_frame_rate) !== "24/1") throw new Error("CHURCHILL_V3_FPS_INVALID");
    if (Math.abs(duration - MASTER_SECONDS) > 0.35) throw new Error(`CHURCHILL_V3_DURATION_INVALID:${duration}`);

    const buffer = await fs.readFile(master);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const target = `${ORGANIZATION_ID}/${p.id}/churchill-night-inside-night-v3/churchill-night-inside-night-90s-master-v3.mp4`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(target, buffer, {
      contentType: "video/mp4",
      upsert: true,
      cacheControl: "3600",
      metadata: {
        organization_id: ORGANIZATION_ID,
        creative_project_id: p.id,
        canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
        agency_edit_standard_version: CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
        checksum,
      },
    });
    if (error) throw error;

    const qc = {
      passed: true,
      duration_seconds: duration,
      width: Number(video.width),
      height: Number(video.height),
      frame_rate: video.r_frame_rate || video.avg_frame_rate,
      video_codec: video.codec_name || null,
      audio_codec: audio.codec_name || null,
      mandatory_story_beats: BEATS.length,
      story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      agency_edit_standard_version: CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
      story_integrity_passed: true,
      authenticity_readiness_passed: true,
      many_realities_motion_only: true,
      native_ambience_mixed: true,
      score_only_mix: false,
      publication_authorized: false,
    };
    const asset = await register({ p, target, bytes: buffer.length, checksum, qc });
    const { data: signed, error: signedError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(target, 86400);
    if (signedError) throw signedError;
    return {
      success: true,
      status: "RENDERED_REVIEW_REQUIRED",
      creative_project_id: p.id,
      master_asset_id: asset.id,
      signed_url: signed?.signedUrl || null,
      output_path: target,
      duration_seconds: duration,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      agency_edit_standard_version: CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
      technical_qc: qc,
      publication_authorized: false,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  const state = repairState(p);
  const readiness = masterReadiness(p);
  return {
    success: true,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    agency_edit_standard_version: CHURCHILL_V3_AGENCY_EDIT_STANDARD_VERSION,
    agency_edit_standard: {
      quality_standard: CHURCHILL_V3_AGENCY_EDIT_STANDARD.quality_standard,
      target_feel: CHURCHILL_V3_AGENCY_EDIT_STANDARD.target_feel,
      release_blockers: CHURCHILL_V3_AGENCY_EDIT_STANDARD.release_blockers,
    },
    story_integrity_passed: assertChurchillNightStoryIntegrity(),
    duration_seconds: MASTER_SECONDS,
    approved_original_vfx: Object.fromEntries([...DIRECT_APPROVED_VFX].map((key) => [key, {
      status: state.original[key]?.status || "NOT_STARTED",
      ready: Boolean(completedReference(state.original[key])),
    }])),
    repairs: {
      shuffleboard_motion: state.r1.shuffleboard_motion?.status || "NOT_STARTED",
      shuffleboard_exit_r2: state.r2.shuffleboard_exit_r2?.status || "NOT_STARTED",
      dart_entry_r2b: state.r2b.dart_entry_r2b?.status || "NOT_STARTED",
      dart_midflight_r2b: state.r2b.dart_midflight_r2b?.status || "NOT_STARTED",
      dart_impact_r2b: state.r2b.dart_impact_r2b?.status || "NOT_STARTED",
    },
    edit_architecture: {
      many_realities: "AUTHENTIC_MOTION_MONTAGE",
      portrait_sources: "CENTERED_PRESERVED_FRAME_WITH_DEFOCUSED_SELF_BACKGROUND",
      sound: "NATIVE_CHURCHILL_AMBIENCE_PLUS_SCORE",
      score_only_mix: false,
      generated_scene_morphs: false,
    },
    readiness,
    master_render_authorized: readiness.ready,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "render") return json(await render());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_RENDER_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
