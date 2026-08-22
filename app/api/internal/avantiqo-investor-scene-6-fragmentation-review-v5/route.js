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
import { investorBrandDefs, investorBrandMark } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const TOKEN = "avq-investor-scene-6-fragmentation-review-v5-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_6_FRAGMENTATION_REVIEW_V5";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const W = 1920;
const H = 1080;
const NARRATION = "Customers, staff, suppliers, conversations, campaigns and creative work all lived in different systems.";
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-review-v5.mp4`;

const MEDIA = Object.freeze({
  customers: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  staff: `${ORG}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  suppliers: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  manager: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  score: `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`,
});

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
        reject(new Error("SCENE_6_V5_TIMEOUT"));
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
  if (!data) throw new Error(`SCENE_6_SOURCE_EMPTY:${storagePath}`);
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

function findAudio(value, depth = 0) {
  if (depth > 9 || !value || typeof value !== "object") return null;
  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) return value.audio_base64.trim();
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = findAudio(item, depth + 1);
    if (found) return found;
  }
  return null;
}

async function makeVoice(localPath) {
  const words = NARRATION.split(/\s+/).filter(Boolean).length;
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: ORG,
    bill_to_organization_id: ORG,
    service_id: "ai.text.to.speech",
    input: {
      input: NARRATION,
      voice: "cedar",
      response_format: "mp3",
      speed: 0.89,
      quantity: Math.max(0.02, words / 124),
      instructions: "Continuation of the approved Avantiqo founder investor-film performance. Neutral international English. Warm, intelligent, experienced, calm, assured and cinematic. Never announcer-like. Pronounce Avantiqo as ah-VAN-tee-koh.",
    },
    metadata: {
      module: "CREATIVE",
      operation: "AVANTIQO_INVESTOR_SCENE_6_FRAGMENTATION_REVIEW_V5",
      brand: "Avantiqo",
      speaker_policy: "ONE_FOUNDER_VOICE_ENTIRE_FILM",
    },
    category: "AI",
  });
  const base64 = findAudio(execution);
  if (!base64) throw new Error("SCENE_6_TTS_EMPTY");
  await fs.writeFile(localPath, Buffer.from(base64, "base64"));
}

async function probeDuration(ffprobe, localPath) {
  const raw = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", localPath], 60000);
  const value = Number(String(raw || "").trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error("SCENE_6_DURATION_INVALID");
  return value;
}

async function normalize(ffmpeg, source, output, seconds, sourceIn = 0, grade = "") {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  const base = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS}`;
  const vf = grade ? `${base},${grade},format=yuv420p` : `${base},format=yuv420p`;
  args.push(
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(seconds),
    "-an",
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "16",
    "-r", String(FPS),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args);
}

async function svgToRaw(directory, name, svg) {
  const bytes = await sharp(svg).resize(W, H).ensureAlpha().raw().toBuffer();
  const target = path.join(directory, `${name}.rgba`);
  await fs.writeFile(target, bytes);
  return target;
}

async function overlayRaw(ffmpeg, source, rgba, output, seconds, sourceIn = 0) {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push(
    "-stream_loop", "-1", "-i", source,
    "-stream_loop", "-1",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", `${W}x${H}`,
    "-framerate", String(FPS),
    "-i", rgba,
    "-t", String(seconds),
    "-filter_complex",
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=contrast=1.025:brightness=-0.008:saturation=0.91,format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='1.4*sin(t*0.56)':y='1.1*sin(t*0.43)':shortest=1,format=yuv420p[v]`,
    "-map", "[v]",
    "-an",
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "16",
    "-r", String(FPS),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args);
}

async function concat(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "scene6-v5.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", "-movflags", "+faststart", output]);
}

function logoTile(key, x, y, size = 48, background = "#111317") {
  const radius = Math.max(10, Math.round(size * 0.24));
  const markSize = Math.round(size * 0.52);
  const offset = (size - markSize) / 2;
  return `<g transform="translate(${x} ${y})"><rect width="${size}" height="${size}" rx="${radius}" fill="${background}" fill-opacity="0.94" stroke="#ffffff" stroke-opacity="0.13" stroke-width="1"/><path d="M8 5 H${size - 8}" stroke="#ffffff" stroke-opacity="0.13" stroke-width="0.8"/>${investorBrandMark(key, { x: offset, y: offset, size: markSize })}</g>`;
}

function channelEvidenceSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<linearGradient id="edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.52" stop-color="#e8edf2" stop-opacity="0.19"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0"/></linearGradient></defs><path d="M170 162 L472 722" stroke="url(#edge)" stroke-width="1"/><path d="M370 126 L534 720" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/><path d="M648 130 L612 720" stroke="#d6a66a" stroke-opacity="0.08" stroke-width="1"/><path d="M840 170 L674 720" stroke="#ffffff" stroke-opacity="0.06" stroke-width="1"/>${logoTile("whatsapp",188,242,46,"#25D366")}${logoTile("line",294,180,44,"#06C755")}${logoTile("messenger",392,284,46,"url(#avqMessengerGradient)")}${logoTile("instagram",504,204,46,"url(#avqInstagramGradient)")}${logoTile("facebook",620,278,44,"#1877F2")}${logoTile("googleReviews",728,214,46,"#FFFFFF")}</svg>`);
}

function campaignEvidenceSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.48" stop-color="#ffffff" stop-opacity="0.14"/><stop offset="0.58" stop-color="#d6a66a" stop-opacity="0.12"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><path d="M140 706 C370 596 620 548 850 574" fill="none" stroke="url(#sweep)" stroke-width="1.2"/><path d="M155 718 C382 620 630 576 852 596" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="7"/>${logoTile("facebook",190,258,44,"#1877F2")}${logoTile("instagram",300,206,46,"url(#avqInstagramGradient)")}${logoTile("googleAds",414,274,48,"#FFFFFF")}${logoTile("tiktok",534,210,46,"#050505")}${logoTile("youtube",650,278,46,"#FF0000")}${logoTile("linkedin",766,218,44,"#0A66C2")}</svg>`);
}

function creativeEvidenceSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.21"/><stop offset="0.5" stop-color="#d5d9de" stop-opacity="0.05"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0.17"/></linearGradient><radialGradient id="flare" cx="24%" cy="30%" r="72%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.13"/><stop offset="0.26" stop-color="#d6a66a" stop-opacity="0.05"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfd4da" stop-opacity="0.24"/><stop offset="0.46" stop-color="#171a1e" stop-opacity="0.02"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0.22"/></linearGradient></defs><g transform="translate(188 172) rotate(-1.3 280 160)"><rect width="570" height="320" rx="8" fill="#05070a" fill-opacity="0.045" stroke="url(#frame)" stroke-width="1.2"/><rect x="1" y="1" width="568" height="318" rx="8" fill="url(#flare)"/><path d="M78 265 C154 86 292 56 455 92 C382 124 298 205 252 286 C204 286 145 280 78 265Z" fill="url(#ribbon)"/><path d="M96 278 C188 250 300 250 476 92" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2"/><path d="M112 286 C242 266 336 228 496 102" fill="none" stroke="#d6a66a" stroke-opacity="0.20" stroke-width="1.5"/></g></svg>`);
}

async function upload(localPath, durationSeconds) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(OUTPUT, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      creative_project_id: PROJECT,
      scene: "6",
      role: "FRAGMENTATION_MONTAGE_REVISED",
      narration: NARRATION,
      duration_seconds: String(durationSeconds),
      edit_policy: "SIX_CINEMATIC_BEATS_MATCHING_SPEECH",
      visual_policy: "REAL_WORLD_FIRST_MICRO_SPATIAL_EVIDENCE_ONLY",
      customer_beat: "REAL_CUSTOMER_INTERACTION",
      staff_beat: "REAL_STAFF_ACTIVITY",
      supplier_beat: "REAL_SUPPLIER_RECEIVING",
      conversation_beat: "AUTHENTIC_CHANNEL_MARKS_NO_CARDS",
      campaign_beat: "AUTHENTIC_CHANNEL_MARKS_NO_CARDS",
      creative_beat: "FRAMELESS_OPTICAL_GLASS_CREATIVE_LIGHT_PLANE",
      no_orb: "true",
      no_pills: "true",
      no_dashboard_cards: "true",
      no_browser_chrome: "true",
      no_fake_ui: "true",
      no_churchill: "true",
      publication_authorized: "false",
      sha256,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene6-v5-"));
  try {
    const local = {
      customers: path.join(directory, "customers.mp4"),
      staff: path.join(directory, "staff.mp4"),
      suppliers: path.join(directory, "suppliers.mp4"),
      manager: path.join(directory, "manager.mp4"),
      score: path.join(directory, "score.mp3"),
      voice: path.join(directory, "voice.mp3"),
    };

    await Promise.all([
      download(MEDIA.customers, local.customers),
      download(MEDIA.staff, local.staff),
      download(MEDIA.suppliers, local.suppliers),
      download(MEDIA.manager, local.manager),
      download(MEDIA.score, local.score),
      makeVoice(local.voice),
    ]);

    const voiceSeconds = await probeDuration(ffprobe, local.voice);
    const seconds = Math.max(6.2, Math.min(7.6, voiceSeconds + 0.10));
    const weights = [0.145, 0.145, 0.145, 0.18, 0.185, 0.20];
    const durations = weights.map((weight) => seconds * weight);
    durations[durations.length - 1] += seconds - durations.reduce((sum, value) => sum + value, 0);

    const channelRaw = await svgToRaw(directory, "channel-evidence", channelEvidenceSvg());
    const campaignRaw = await svgToRaw(directory, "campaign-evidence", campaignEvidenceSvg());
    const creativeRaw = await svgToRaw(directory, "creative-evidence", creativeEvidenceSvg());

    const clips = [
      path.join(directory, "01-customers.mp4"),
      path.join(directory, "02-staff.mp4"),
      path.join(directory, "03-suppliers.mp4"),
      path.join(directory, "04-conversations.mp4"),
      path.join(directory, "05-campaigns.mp4"),
      path.join(directory, "06-creative.mp4"),
    ];

    const grade = "eq=contrast=1.035:brightness=-0.012:saturation=0.91";
    await normalize(ffmpeg, local.customers, clips[0], durations[0], 0.38, grade);
    await normalize(ffmpeg, local.staff, clips[1], durations[1], 0.42, grade);
    await normalize(ffmpeg, local.suppliers, clips[2], durations[2], 0.38, grade);
    await overlayRaw(ffmpeg, local.manager, channelRaw, clips[3], durations[3], 0.22);
    await overlayRaw(ffmpeg, local.manager, campaignRaw, clips[4], durations[4], 1.65);
    await overlayRaw(ffmpeg, local.manager, creativeRaw, clips[5], durations[5], 3.10);

    const picture = path.join(directory, "scene6-picture.mp4");
    const final = path.join(directory, "scene-06-fragmentation-review-v5.mp4");
    await concat(ffmpeg, clips, picture, directory);

    const filter = [
      `[1:a]asetpts=PTS-STARTPTS,volume=1.0,apad,atrim=duration=${seconds}[voice]`,
      `[2:a]atrim=start=15.61:duration=${seconds},asetpts=PTS-STARTPTS,volume=0.13,afade=t=in:st=0:d=0.20,afade=t=out:st=${Math.max(0.20, seconds - 0.32)}:d=0.28[score]`,
      `[voice][score]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${seconds}[a]`,
    ].join(";");

    await run(ffmpeg, [
      "-y",
      "-i", picture,
      "-i", local.voice,
      "-i", local.score,
      "-filter_complex", filter,
      "-map", "0:v:0",
      "-map", "[a]",
      "-t", String(seconds),
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "320k",
      "-ar", "48000",
      "-ac", "2",
      "-movflags", "+faststart",
      final,
    ]);

    const stored = await upload(final, seconds);
    return {
      success: true,
      contract: CONTRACT,
      scene: 6,
      narration: NARRATION,
      duration_seconds: seconds,
      output_path: OUTPUT,
      output_ready: true,
      signed_url: await signedUrl(OUTPUT),
      rules: {
        no_orb: true,
        no_pills: true,
        no_dashboard_cards: true,
        no_browser_chrome: true,
        no_fake_ui: true,
        no_churchill: true,
      },
      ...stored,
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

    if (action === "render") return json(await render());
    const ready = await exists(OUTPUT);
    if (action === "signed") {
      return json({ success: true, output_ready: ready, output_path: OUTPUT, signed_url: ready ? await signedUrl(OUTPUT) : null });
    }
    if (action === "status") {
      return json({
        success: true,
        contract: CONTRACT,
        scene: 6,
        narration: NARRATION,
        output_ready: ready,
        output_path: OUTPUT,
        rules: {
          no_orb: true,
          no_pills: true,
          no_dashboard_cards: true,
          no_browser_chrome: true,
          no_fake_ui: true,
          no_churchill: true,
        },
      });
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
