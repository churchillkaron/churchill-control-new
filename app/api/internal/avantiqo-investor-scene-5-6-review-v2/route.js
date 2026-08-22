export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandBadge, investorBrandDefs } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const TOKEN = "avq-investor-scene-5-6-review-v2-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_5_6_REVIEW_V2";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const WIDTH = 1920;
const HEIGHT = 1080;

const MEDIA = Object.freeze({
  operations: `${ORGANIZATION_ID}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  customers: `${ORGANIZATION_ID}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  staff: `${ORGANIZATION_ID}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  suppliers: `${ORGANIZATION_ID}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  manager: `${ORGANIZATION_ID}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  score: `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`,
});

const SCENE_5 = Object.freeze({
  scene: 5,
  role: "LIVE_OPERATIONS_KITCHEN",
  narration: "Operations knew another.",
  visual_policy: [
    "REAL_CINEMATIC_KITCHEN_EXECUTION",
    "NO_UI",
    "NO_HOLOGRAM",
    "NO_TEXT_OVERLAY",
    "NO_CHURCHILL_BRANDING",
  ],
});

const SCENE_6 = Object.freeze({
  scene: 6,
  role: "FRAGMENTATION_MONTAGE_REVISED",
  narration: "Customers, staff, suppliers, conversations, campaigns and creative work all lived in different systems.",
  visual_policy: [
    "FOOTAGE_FIRST",
    "LUXURY_OPTICAL_GLASS_ONLY_FOR_COMMUNICATION_CAMPAIGN_CREATIVE_PROOF",
    "AUTHENTIC_CHANNEL_MARKS",
    "NO_PRINT_SCREENS",
    "NO_BROWSER_CHROME",
    "NO_FAKE_DASHBOARD",
    "NO_CHURCHILL_BRANDING",
  ],
});

const SCENE5_PATH = `${ORGANIZATION_ID}/${PROJECT_ID}/scene-previews-20260822/scene-05-operations-luxury-review-v2.mp4`;
const SCENE6_PATH = `${ORGANIZATION_ID}/${PROJECT_ID}/scene-previews-20260822/scene-06-fragmentation-luxury-review-v2.mp4`;

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
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
        reject(new Error("SCENE_5_6_REVIEW_RENDER_TIMEOUT"));
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
      else resolve(out);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SCENE_5_6_SOURCE_EMPTY:${storagePath}`);
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

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      ...metadata,
      contract: CONTRACT,
      organization_id: ORGANIZATION_ID,
      creative_project_id: PROJECT_ID,
      fps: String(FPS),
      width: String(WIDTH),
      height: String(HEIGHT),
      no_churchill: "true",
      print_screen_used: "false",
      publication_authorized: "false",
      sha256,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

function findAudioBase64(value, depth = 0) {
  if (depth > 9 || !value || typeof value !== "object") return null;
  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) return value.audio_base64.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioBase64(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const item of Object.values(value)) {
    const found = findAudioBase64(item, depth + 1);
    if (found) return found;
  }
  return null;
}

async function synthesizeSpeech(text, operation, outputPath) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.text.to.speech",
    input: {
      input: text,
      voice: "cedar",
      response_format: "mp3",
      speed: 0.89,
      quantity: Math.max(0.02, words / 124),
      instructions: "Exact continuation of the approved Avantiqo founder investor-film voice. Neutral international English. Warm, intelligent, experienced, calm, assured and cinematic. Never sound like an announcer. Pronounce Avantiqo as ah-VAN-tee-koh. Keep the microphone perspective intimate and premium with natural sentence rhythm.",
    },
    metadata: {
      module: "CREATIVE",
      operation,
      brand: "Avantiqo",
      source: "avantiqo_investor_scene_5_6_review_v2",
      speaker_policy: "ONE_FOUNDER_VOICE_ENTIRE_FILM",
    },
    category: "AI",
  });
  const base64 = findAudioBase64(execution);
  if (!base64) throw new Error(`SCENE_5_6_TTS_EMPTY:${operation}`);
  await fs.writeFile(outputPath, Buffer.from(base64, "base64"));
}

async function duration(ffprobe, localPath) {
  const raw = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", localPath], 60000);
  const value = Number(String(raw || "").trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`SCENE_5_6_DURATION_INVALID:${localPath}`);
  return value;
}

async function normalizeVideo(ffmpeg, source, output, seconds, sourceIn = 0) {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push(
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(seconds),
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

async function overlayVideo(ffmpeg, source, overlayPng, output, seconds, sourceIn = 0) {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push(
    "-stream_loop", "-1", "-i", source,
    "-loop", "1", "-framerate", String(FPS), "-i", overlayPng,
    "-t", String(seconds),
    "-filter_complex",
    `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FPS},format=yuv420p[b];[1:v]format=rgba,fade=t=in:st=0:d=0.22:alpha=1,fade=t=out:st=${Math.max(0.25, seconds - 0.3)}:d=0.28:alpha=1[o];[b][o]overlay=x='4*sin(t*0.7)':y='3*sin(t*0.51)':shortest=1,format=yuv420p[v]`,
    "-map", "[v]",
    "-an",
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
  const list = path.join(directory, `concat-${crypto.randomBytes(4).toString("hex")}.txt`);
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", "-movflags", "+faststart", output]);
}

async function mixFinal(ffmpeg, picture, voice, score, scoreOffset, seconds, output) {
  const filter = [
    `[1:a]asetpts=PTS-STARTPTS,volume=1.0,apad,atrim=duration=${seconds}[voice]`,
    `[2:a]atrim=start=${scoreOffset}:duration=${seconds},asetpts=PTS-STARTPTS,volume=0.14,afade=t=in:st=0:d=0.18,afade=t=out:st=${Math.max(0.2, seconds - 0.28)}:d=0.24[score]`,
    `[voice][score]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${seconds}[a]`,
  ].join(";");
  await run(ffmpeg, [
    "-y",
    "-i", picture,
    "-i", voice,
    "-i", score,
    "-filter_complex", filter,
    "-map", "0:v:0",
    "-map", "[a]",
    "-t", String(seconds),
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "256k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    output,
  ]);
}

function communicationGlassSvg() {
  const nodes = [
    ["whatsapp", 155, 245, 192, 76],
    ["line", 402, 156, 192, 76],
    ["messenger", 672, 254, 192, 76],
    ["instagram", 938, 158, 192, 76],
    ["facebook", 1206, 250, 192, 76],
    ["googleReviews", 1468, 166, 250, 76],
  ];
  const badges = nodes.map(([key, x, y, w, h]) => `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="28" fill="#05070a" fill-opacity=".34" stroke="#e8edf2" stroke-opacity=".21" stroke-width="1.1"/><path d="M24 10 H${w - 34}" stroke="#ffffff" stroke-opacity=".18"/>${investorBrandBadge(key, { x: 14, y: 15, width: w - 28, height: h - 30 })}</g>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs>${investorBrandDefs()}<radialGradient id="g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#f3f5f7" stop-opacity=".07"/><stop offset=".58" stop-color="#bac0c7" stop-opacity=".018"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="960" cy="500" rx="790" ry="330" fill="url(#g)"/>${badges}</svg>`);
}

function marketingGlassSvg() {
  const keys = ["facebook", "instagram", "googleAds", "tiktok", "youtube", "linkedin"];
  const x = [142, 410, 680, 950, 1220, 1490];
  const badges = keys.map((key, i) => `<g transform="translate(${x[i]} ${i % 2 === 0 ? 222 : 154})"><rect width="210" height="82" rx="30" fill="#05070a" fill-opacity=".31" stroke="#e8edf2" stroke-opacity=".19" stroke-width="1.1"/><path d="M24 11 H176" stroke="#ffffff" stroke-opacity=".16"/>${investorBrandBadge(key, { x: 12, y: 18, width: 186, height: 48 })}</g>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs>${investorBrandDefs()}<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".5" stop-color="#d6a66a" stop-opacity=".025"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><path d="M100 510 C480 250 1420 250 1820 510" fill="none" stroke="url(#sheen)" stroke-width="2"/>${badges}</svg>`);
}

function creativeGlassSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7f8fa" stop-opacity=".16"/><stop offset=".28" stop-color="#aeb5bd" stop-opacity=".055"/><stop offset=".72" stop-color="#090b0f" stop-opacity=".12"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".055"/></linearGradient><radialGradient id="metal" cx="38%" cy="26%" r="72%"><stop offset="0" stop-color="#f5f3ed"/><stop offset=".18" stop-color="#adb3ba"/><stop offset=".44" stop-color="#262b31"/><stop offset=".69" stop-color="#d6a66a"/><stop offset=".76" stop-color="#3b3123"/><stop offset="1" stop-color="#050607"/></radialGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#bdc4cb" stop-opacity=".14"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".34"/></linearGradient><filter id="blur"><feGaussianBlur stdDeviation="34"/></filter></defs><g transform="translate(500 128)"><rect width="920" height="720" rx="44" fill="#040506" fill-opacity=".46" stroke="url(#edge)" stroke-width="1.4"/><rect x="20" y="20" width="880" height="680" rx="34" fill="url(#glass)"/><ellipse cx="460" cy="390" rx="250" ry="250" fill="#d6a66a" fill-opacity=".08" filter="url(#blur)"/><g transform="translate(460 385) rotate(-17)"><ellipse cx="0" cy="0" rx="188" ry="260" fill="url(#metal)"/><ellipse cx="-22" cy="-40" rx="105" ry="168" fill="#0a0c0f" fill-opacity=".34"/><path d="M-92 -172 C-18 -258 112 -210 142 -94" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="4"/><path d="M-124 178 C-46 254 92 232 146 132" fill="none" stroke="#d6a66a" stroke-opacity=".54" stroke-width="5"/></g><path d="M78 72 H842" stroke="#fff" stroke-opacity=".14"/><circle cx="842" cy="72" r="4" fill="#d6a66a"/></g></svg>`);
}

async function makePng(directory, name, svg) {
  const target = path.join(directory, `${name}.png`);
  await sharp(svg).png().toFile(target);
  return target;
}

async function renderScene5(ffmpeg, ffprobe, directory, local) {
  const voice = path.join(directory, "scene5-voice.mp3");
  await synthesizeSpeech(SCENE_5.narration, "AVANTIQO_INVESTOR_SCENE_5_REVIEW_V2", voice);
  const voiceSeconds = await duration(ffprobe, voice);
  const seconds = Math.max(1.2, Math.min(2.4, voiceSeconds + 0.08));
  const picture = path.join(directory, "scene5-picture.mp4");
  const final = path.join(directory, "scene5-final.mp4");
  await normalizeVideo(ffmpeg, local.operations, picture, seconds, 0.55);
  await mixFinal(ffmpeg, picture, voice, local.score, 14.344, seconds, final);
  const stored = await upload(SCENE5_PATH, final, {
    scene: "5",
    role: SCENE_5.role,
    narration: SCENE_5.narration,
    duration_seconds: String(seconds),
    treatment: "CINEMATIC_REAL_OPERATIONS_NO_UI",
  });
  return { scene: 5, duration_seconds: seconds, output_path: SCENE5_PATH, signed_url: await signedUrl(SCENE5_PATH), ...stored };
}

async function renderScene6(ffmpeg, ffprobe, directory, local) {
  const voice = path.join(directory, "scene6-voice.mp3");
  await synthesizeSpeech(SCENE_6.narration, "AVANTIQO_INVESTOR_SCENE_6_REVIEW_V2", voice);
  const voiceSeconds = await duration(ffprobe, voice);
  const seconds = Math.max(5.1, Math.min(7.2, voiceSeconds + 0.12));

  const weights = [0.155, 0.155, 0.155, 0.18, 0.18, 0.175];
  const durations = weights.map((weight) => seconds * weight);
  durations[durations.length - 1] += seconds - durations.reduce((sum, value) => sum + value, 0);

  const communication = await makePng(directory, "scene6-communication-glass", communicationGlassSvg());
  const marketing = await makePng(directory, "scene6-marketing-glass", marketingGlassSvg());
  const creative = await makePng(directory, "scene6-creative-glass", creativeGlassSvg());

  const clips = [
    path.join(directory, "scene6-01-customers.mp4"),
    path.join(directory, "scene6-02-staff.mp4"),
    path.join(directory, "scene6-03-suppliers.mp4"),
    path.join(directory, "scene6-04-conversations.mp4"),
    path.join(directory, "scene6-05-campaigns.mp4"),
    path.join(directory, "scene6-06-creative.mp4"),
  ];

  await normalizeVideo(ffmpeg, local.customers, clips[0], durations[0], 0.35);
  await normalizeVideo(ffmpeg, local.staff, clips[1], durations[1], 0.45);
  await normalizeVideo(ffmpeg, local.suppliers, clips[2], durations[2], 0.4);
  await overlayVideo(ffmpeg, local.manager, communication, clips[3], durations[3], 0.25);
  await overlayVideo(ffmpeg, local.manager, marketing, clips[4], durations[4], 1.55);
  await overlayVideo(ffmpeg, local.manager, creative, clips[5], durations[5], 3.0);

  const picture = path.join(directory, "scene6-picture.mp4");
  const final = path.join(directory, "scene6-final.mp4");
  await concatVideo(ffmpeg, clips, picture, directory);
  await mixFinal(ffmpeg, picture, voice, local.score, 15.61, seconds, final);

  const stored = await upload(SCENE6_PATH, final, {
    scene: "6",
    role: SCENE_6.role,
    narration: SCENE_6.narration,
    duration_seconds: String(seconds),
    treatment: "FRAGMENTED_REAL_WORLD_PLUS_LUXURY_OPTICAL_GLASS",
    communication_marks: "WHATSAPP,LINE,MESSENGER,INSTAGRAM,FACEBOOK,GOOGLE_REVIEWS",
    campaign_marks: "FACEBOOK,INSTAGRAM,GOOGLE_ADS,TIKTOK,YOUTUBE,LINKEDIN",
    print_screen_used: "false",
    churchill_used: "false",
  });
  return { scene: 6, duration_seconds: seconds, output_path: SCENE6_PATH, signed_url: await signedUrl(SCENE6_PATH), ...stored };
}

async function renderBoth() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene-5-6-v2-"));
  try {
    const local = {
      operations: path.join(directory, "operations.mp4"),
      customers: path.join(directory, "customers.mp4"),
      staff: path.join(directory, "staff.mp4"),
      suppliers: path.join(directory, "suppliers.mp4"),
      manager: path.join(directory, "manager.mp4"),
      score: path.join(directory, "score.mp3"),
    };
    await Promise.all([
      download(MEDIA.operations, local.operations),
      download(MEDIA.customers, local.customers),
      download(MEDIA.staff, local.staff),
      download(MEDIA.suppliers, local.suppliers),
      download(MEDIA.manager, local.manager),
      download(MEDIA.score, local.score),
    ]);

    const scene5 = await renderScene5(ffmpeg, ffprobe, directory, local);
    const scene6 = await renderScene6(ffmpeg, ffprobe, directory, local);
    return {
      success: true,
      contract: CONTRACT,
      scene5,
      scene6,
      rules: {
        no_churchill: true,
        no_print_screens: true,
        luxury_optical_glass: true,
        footage_first: true,
        publication_authorized: false,
      },
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

    if (action === "render") return json(await renderBoth());
    if (action === "signed") {
      const [scene5Ready, scene6Ready] = await Promise.all([exists(SCENE5_PATH), exists(SCENE6_PATH)]);
      return json({
        success: true,
        scene5: { output_ready: scene5Ready, output_path: SCENE5_PATH, signed_url: scene5Ready ? await signedUrl(SCENE5_PATH) : null },
        scene6: { output_ready: scene6Ready, output_path: SCENE6_PATH, signed_url: scene6Ready ? await signedUrl(SCENE6_PATH) : null },
      });
    }
    if (action === "status") {
      const [scene5Ready, scene6Ready] = await Promise.all([exists(SCENE5_PATH), exists(SCENE6_PATH)]);
      return json({
        success: true,
        contract: CONTRACT,
        scene5: { ...SCENE_5, output_ready: scene5Ready, output_path: SCENE5_PATH },
        scene6: { ...SCENE_6, output_ready: scene6Ready, output_path: SCENE6_PATH },
        rules: { no_churchill: true, no_print_screens: true, luxury_optical_glass: true, footage_first: true },
      });
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
