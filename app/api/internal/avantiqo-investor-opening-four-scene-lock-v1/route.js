export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-opening-four-scene-lock-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

const OPENING = `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/google-veo-opening-v1/avantiqo-synthetic-intelligence-plus-logo-both-original-fx-v4.mp4`;
const FOUNDER = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7/founder-opening-origin-synced-approved-v7.mp4`;
const RESTAURANT = `${ORGANIZATION_ID}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`;
const RESTAURANT_ALT = `${ORGANIZATION_ID}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`;
const FINANCE = `${ORGANIZATION_ID}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`;
const NARRATION = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;
const SCORE = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`;

const OPENING_SECONDS = 15.35;
const FOUNDER_SECONDS = 5.063;
const RESTAURANT_SECONDS = 6.328;
const RESTAURANT_PRIMARY_SECONDS = 5.0;
const RESTAURANT_ALT_SECONDS = RESTAURANT_SECONDS - RESTAURANT_PRIMARY_SECONDS;
// The first sentence of origin-03 is 7 of 40 locked-script words: 16.875 * 7 / 40 = 2.953125.
const FINANCE_SECONDS = 2.953;
const NARRATION_SECONDS = FOUNDER_SECONDS + RESTAURANT_SECONDS + FINANCE_SECONDS;
const TOTAL_SECONDS = OPENING_SECONDS + NARRATION_SECONDS;
const NARRATION_DELAY_MS = Math.round(OPENING_SECONDS * 1000);
const OUTPUT_PATH = `${ORGANIZATION_ID}/${PROJECT_ID}/scene-previews-20260822/avantiqo-opening-four-scenes-locked-v1.mp4`;

const supabase = getServiceSupabase();

const LOCK = Object.freeze({
  contract: "AVANTIQO_INVESTOR_OPENING_FOUR_SCENE_LOCK_V1",
  locked: true,
  publication_authorized: false,
  total_seconds: TOTAL_SECONDS,
  narration_seconds: NARRATION_SECONDS,
  scenes: [
    {
      scene: 1,
      role: "SYNTHETIC_INTELLIGENCE_AND_AVANTIQO_LOGO",
      duration_seconds: OPENING_SECONDS,
      source: OPENING,
      audio: "ORIGINAL_OPENING_AND_LOGO_AUDIO_PRESERVED",
    },
    {
      scene: 2,
      role: "FOUNDER_ORIGIN",
      duration_seconds: FOUNDER_SECONDS,
      source: FOUNDER,
      narration: "I didn't build Avantiqo because I wanted to create another software company.",
    },
    {
      scene: 3,
      role: "BUSY_RESTAURANT_REAL_BUSINESS",
      duration_seconds: RESTAURANT_SECONDS,
      sources: [RESTAURANT, RESTAURANT_ALT],
      narration: "I built it because running real businesses showed me the same problem again and again.",
      visual_policy: "BUSY_ACTIVE_RESTAURANT_NO_UI_NO_HOLOGRAM_NO_TEXT",
    },
    {
      scene: 4,
      role: "FINANCE_ACCOUNTING",
      duration_seconds: FINANCE_SECONDS,
      source: FINANCE,
      narration: "Finance knew one part of the business.",
      visual_policy: "FINANCE_ACCOUNTING_ENVIRONMENT_NO_FAKE_UI",
    },
  ],
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FOUR_SCENE_LOCK_EDITOR_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-14000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(true);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`FOUR_SCENE_LOCK_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function exists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, {
    search: filename,
    limit: 10,
  });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function normalizeVideo(ffmpeg, source, output, duration, sourceIn = 0) {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push(
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "16",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args);
}

async function concatVideo(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "four-scenes.concat.txt");
  await fs.writeFile(
    list,
    clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", list,
    "-an",
    "-c:v", "copy",
    "-movflags", "+faststart",
    output,
  ]);
}

async function makeAudio(ffmpeg, opening, narration, score, output) {
  const filter = [
    `[0:a]atrim=duration=${OPENING_SECONDS},asetpts=PTS-STARTPTS,apad,atrim=duration=${TOTAL_SECONDS}[opening]`,
    `[1:a]atrim=start=0:duration=${NARRATION_SECONDS},asetpts=PTS-STARTPTS,adelay=${NARRATION_DELAY_MS}|${NARRATION_DELAY_MS},apad,atrim=duration=${TOTAL_SECONDS}[voice]`,
    `[2:a]atrim=start=0:duration=${NARRATION_SECONDS},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.6,volume=0.16,adelay=${NARRATION_DELAY_MS}|${NARRATION_DELAY_MS},apad,atrim=duration=${TOTAL_SECONDS}[score]`,
    `[opening][voice][score]amix=inputs=3:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${TOTAL_SECONDS}[a]`,
  ].join(";");

  await run(ffmpeg, [
    "-y",
    "-i", opening,
    "-i", narration,
    "-i", score,
    "-filter_complex", filter,
    "-map", "[a]",
    "-c:a", "aac",
    "-b:a", "320k",
    "-ar", "48000",
    "-ac", "2",
    output,
  ]);
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(OUTPUT_PATH, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      contract: LOCK.contract,
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      locked: "true",
      scene_count: "4",
      duration_seconds: String(TOTAL_SECONDS),
      scene_1: "SYNTHETIC_INTELLIGENCE_AND_AVANTIQO_LOGO",
      scene_2: "FOUNDER_ORIGIN",
      scene_3: "BUSY_RESTAURANT_REAL_BUSINESS",
      scene_4: "FINANCE_ACCOUNTING",
      cedar_narration: NARRATION,
      approved_score: SCORE,
      fake_ui_allowed: "false",
      generated_images_used: "false",
      publication_authorized: "false",
      sha256,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-four-scene-lock-"));
  try {
    const source = {
      opening: path.join(directory, "opening-source.mp4"),
      founder: path.join(directory, "founder-source.mp4"),
      restaurant: path.join(directory, "restaurant-source.mp4"),
      restaurantAlt: path.join(directory, "restaurant-alt-source.mp4"),
      finance: path.join(directory, "finance-source.mp4"),
      narration: path.join(directory, "narration.mp3"),
      score: path.join(directory, "score.mp3"),
    };

    await Promise.all([
      download(OPENING, source.opening),
      download(FOUNDER, source.founder),
      download(RESTAURANT, source.restaurant),
      download(RESTAURANT_ALT, source.restaurantAlt),
      download(FINANCE, source.finance),
      download(NARRATION, source.narration),
      download(SCORE, source.score),
    ]);

    const clips = [
      path.join(directory, "01-opening.mp4"),
      path.join(directory, "02-founder.mp4"),
      path.join(directory, "03a-restaurant.mp4"),
      path.join(directory, "03b-restaurant-alt.mp4"),
      path.join(directory, "04-finance.mp4"),
    ];

    await normalizeVideo(ffmpeg, source.opening, clips[0], OPENING_SECONDS);
    await normalizeVideo(ffmpeg, source.founder, clips[1], FOUNDER_SECONDS);
    await normalizeVideo(ffmpeg, source.restaurant, clips[2], RESTAURANT_PRIMARY_SECONDS);
    await normalizeVideo(ffmpeg, source.restaurantAlt, clips[3], RESTAURANT_ALT_SECONDS);
    await normalizeVideo(ffmpeg, source.finance, clips[4], FINANCE_SECONDS);

    const picture = path.join(directory, "four-scenes-picture.mp4");
    const audio = path.join(directory, "four-scenes-audio.m4a");
    const final = path.join(directory, "avantiqo-opening-four-scenes-locked-v1.mp4");

    await concatVideo(ffmpeg, clips, picture, directory);
    await makeAudio(ffmpeg, source.opening, source.narration, source.score, audio);
    await run(ffmpeg, [
      "-y",
      "-i", picture,
      "-i", audio,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-t", String(TOTAL_SECONDS),
      "-c:v", "copy",
      "-c:a", "copy",
      "-movflags", "+faststart",
      final,
    ]);

    const stored = await upload(final);
    return {
      success: true,
      ...LOCK,
      output_path: OUTPUT_PATH,
      output_ready: true,
      bytes: stored.bytes,
      sha256: stored.sha256,
      signed_url: await signedUrl(OUTPUT_PATH),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").trim().toLowerCase();

    if (action === "status") {
      return json({
        success: true,
        ...LOCK,
        output_path: OUTPUT_PATH,
        output_ready: await exists(OUTPUT_PATH),
      });
    }
    if (action === "render") return json(await render());
    if (action === "signed") {
      const ready = await exists(OUTPUT_PATH);
      return json({
        success: true,
        output_path: OUTPUT_PATH,
        output_ready: ready,
        signed_url: ready ? await signedUrl(OUTPUT_PATH) : null,
      });
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: LOCK.contract, error: error?.message || String(error) }, 500);
  }
}
