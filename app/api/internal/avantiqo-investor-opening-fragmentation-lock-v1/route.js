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

const TOKEN = "avq-investor-opening-fragmentation-lock-20260822-v1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

const MEDIA = Object.freeze({
  opening: `${ORGANIZATION_ID}/avantiqo-investor-film-20260822/google-veo-opening-v1/avantiqo-synthetic-intelligence-plus-logo-both-original-fx-v4.mp4`,
  founder: `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/founder-v7/founder-opening-origin-synced-approved-v7.mp4`,
  restaurant: `${ORGANIZATION_ID}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  restaurantAlt: `${ORGANIZATION_ID}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`,
  finance: `${ORGANIZATION_ID}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  operations: `${ORGANIZATION_ID}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  customers: `${ORGANIZATION_ID}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  staff: `${ORGANIZATION_ID}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  suppliers: `${ORGANIZATION_ID}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  marketing: `${ORGANIZATION_ID}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  fragmentedOperator: `${ORGANIZATION_ID}/unassigned/8fce813d-68ac-4032-918e-0eee89871265-gemini-q1zghwo9x4g8.mp4`,
  narration: `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`,
  score: `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`,
});

const OPENING_SECONDS = 15.35;
const FOUNDER_SECONDS = 5.063;
const RESTAURANT_SECONDS = 6.328;
const RESTAURANT_PRIMARY_SECONDS = 5.0;
const RESTAURANT_ALT_SECONDS = RESTAURANT_SECONDS - RESTAURANT_PRIMARY_SECONDS;

// Exact origin-03 split from the locked 40-word / 16.875-second Cedar beat.
const FINANCE_SECONDS = 2.953125; // 7 words
const OPERATIONS_SECONDS = 1.265625; // 3 words
const FRAGMENTATION_SECONDS = 4.21875; // 10 words
const OPERATOR_PROBLEM_SECONDS = 8.4375; // 20 words

const CUSTOMER_SECONDS = 1.0;
const STAFF_SECONDS = 1.0;
const SUPPLIER_SECONDS = 1.0;
const MARKETING_SECONDS = FRAGMENTATION_SECONDS - CUSTOMER_SECONDS - STAFF_SECONDS - SUPPLIER_SECONDS;

const NARRATION_SECONDS = FOUNDER_SECONDS + RESTAURANT_SECONDS + FINANCE_SECONDS + OPERATIONS_SECONDS + FRAGMENTATION_SECONDS + OPERATOR_PROBLEM_SECONDS;
const TOTAL_SECONDS = OPENING_SECONDS + NARRATION_SECONDS;
const NARRATION_DELAY_MS = Math.round(OPENING_SECONDS * 1000);
const OUTPUT_PATH = `${ORGANIZATION_ID}/${PROJECT_ID}/scene-previews-20260822/avantiqo-opening-fragmentation-locked-v1.mp4`;

const LOCK = Object.freeze({
  contract: "AVANTIQO_INVESTOR_OPENING_FRAGMENTATION_LOCK_V1",
  locked: true,
  publication_authorized: false,
  total_seconds: TOTAL_SECONDS,
  narration_seconds: NARRATION_SECONDS,
  scenes: [
    {
      scene: 1,
      role: "SYNTHETIC_INTELLIGENCE_AND_AVANTIQO_LOGO",
      duration_seconds: OPENING_SECONDS,
      source: MEDIA.opening,
    },
    {
      scene: 2,
      role: "FOUNDER_ORIGIN",
      duration_seconds: FOUNDER_SECONDS,
      source: MEDIA.founder,
      narration: "I didn't build Avantiqo because I wanted to create another software company.",
    },
    {
      scene: 3,
      role: "BUSY_RESTAURANT_REAL_BUSINESS",
      duration_seconds: RESTAURANT_SECONDS,
      sources: [MEDIA.restaurant, MEDIA.restaurantAlt],
      narration: "I built it because running real businesses showed me the same problem again and again.",
      visual_policy: "BUSY_ACTIVE_RESTAURANT_NO_UI_NO_HOLOGRAM_NO_TEXT",
    },
    {
      scene: 4,
      role: "FINANCE_ACCOUNTING",
      duration_seconds: FINANCE_SECONDS,
      source: MEDIA.finance,
      narration: "Finance knew one part of the business.",
      visual_policy: "FINANCE_ACCOUNTING_ENVIRONMENT_NO_FAKE_UI",
    },
    {
      scene: 5,
      role: "LIVE_OPERATIONS_KITCHEN",
      duration_seconds: OPERATIONS_SECONDS,
      source: MEDIA.operations,
      narration: "Operations knew another.",
      visual_policy: "REAL_KITCHEN_EXECUTION_NO_UI_NO_HOLOGRAM_NO_TEXT",
    },
    {
      scene: 6,
      role: "FRAGMENTATION_MONTAGE",
      duration_seconds: FRAGMENTATION_SECONDS,
      narration: "Customers, staff, suppliers and marketing all lived in different systems.",
      cuts: [
        { role: "CUSTOMERS", duration_seconds: CUSTOMER_SECONDS, source: MEDIA.customers, semantic: "HOTEL_GUEST_CUSTOMER_INTERACTION" },
        { role: "STAFF", duration_seconds: STAFF_SECONDS, source: MEDIA.staff, semantic: "PEOPLE_ROSTER" },
        { role: "SUPPLIERS", duration_seconds: SUPPLIER_SECONDS, source: MEDIA.suppliers, semantic: "PROCUREMENT_RECEIVING" },
        { role: "MARKETING", duration_seconds: MARKETING_SECONDS, source: MEDIA.marketing, semantic: "MANAGER_MARKETING_WORK" },
      ],
      edit_policy: "HARD_CINEMATIC_CUTS_NO_LABELS_NO_INFOGRAPHICS_NO_FAKE_UI",
    },
    {
      scene: 7,
      role: "OPERATOR_IS_THE_INTEGRATION_LAYER",
      duration_seconds: OPERATOR_PROBLEM_SECONDS,
      source: MEDIA.fragmentedOperator,
      narration: "Whenever I wanted to understand what was really happening, I had to put the company back together in my head.",
      visual_policy: "ONE_HUMAN_FORCED_TO_RECONNECT_SEPARATE_INFORMATION_SOURCES_NO_OVERLAYS",
    },
  ],
});

const supabase = getServiceSupabase();

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
      reject(new Error("FRAGMENTATION_LOCK_EDITOR_TIMEOUT"));
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
  if (!data) throw new Error(`FRAGMENTATION_LOCK_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function exists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: filename, limit: 10 });
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
  const list = path.join(directory, "fragmentation.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
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
      scene_count: "7",
      scene_6: "CUSTOMERS_STAFF_SUPPLIERS_MARKETING_FRAGMENTATION_MONTAGE",
      scene_7: "OPERATOR_IS_THE_INTEGRATION_LAYER",
      cedar_narration: MEDIA.narration,
      approved_score: MEDIA.score,
      fake_ui_allowed: "false",
      infographic_overlays_allowed: "false",
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

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-fragmentation-lock-"));
  try {
    const local = {};
    for (const [key, storagePath] of Object.entries(MEDIA)) {
      const extension = key === "narration" || key === "score" ? ".mp3" : ".mp4";
      local[key] = path.join(directory, `${key}${extension}`);
      await download(storagePath, local[key]);
    }

    const clips = [
      ["01-opening", "opening", OPENING_SECONDS, 0],
      ["02-founder", "founder", FOUNDER_SECONDS, 0],
      ["03a-restaurant", "restaurant", RESTAURANT_PRIMARY_SECONDS, 0],
      ["03b-restaurant-alt", "restaurantAlt", RESTAURANT_ALT_SECONDS, 0],
      ["04-finance", "finance", FINANCE_SECONDS, 0],
      ["05-operations", "operations", OPERATIONS_SECONDS, 0],
      ["06a-customers", "customers", CUSTOMER_SECONDS, 0],
      ["06b-staff", "staff", STAFF_SECONDS, 0],
      ["06c-suppliers", "suppliers", SUPPLIER_SECONDS, 0],
      ["06d-marketing", "marketing", MARKETING_SECONDS, 0],
      ["07-fragmented-operator", "fragmentedOperator", OPERATOR_PROBLEM_SECONDS, 0],
    ];

    const normalized = [];
    for (const [name, sourceKey, duration, sourceIn] of clips) {
      const target = path.join(directory, `${name}.mp4`);
      await normalizeVideo(ffmpeg, local[sourceKey], target, duration, sourceIn);
      normalized.push(target);
    }

    const picture = path.join(directory, "fragmentation-picture.mp4");
    const audio = path.join(directory, "fragmentation-audio.m4a");
    const final = path.join(directory, "avantiqo-opening-fragmentation-locked-v1.mp4");

    await concatVideo(ffmpeg, normalized, picture, directory);
    await makeAudio(ffmpeg, local.opening, local.narration, local.score, audio);
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
      return json({ success: true, ...LOCK, output_path: OUTPUT_PATH, output_ready: await exists(OUTPUT_PATH) });
    }
    if (action === "render") return json(await render());
    if (action === "signed") {
      const ready = await exists(OUTPUT_PATH);
      return json({ success: true, output_path: OUTPUT_PATH, output_ready: ready, signed_url: ready ? await signedUrl(OUTPUT_PATH) : null });
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: LOCK.contract, error: error?.message || String(error) }, 500);
  }
}
