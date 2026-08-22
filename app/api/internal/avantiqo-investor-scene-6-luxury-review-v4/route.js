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

const TOKEN = "avq-investor-scene-6-luxury-review-v4-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_6_LUXURY_REVIEW_V4";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const W = 1920;
const H = 1080;
const NARRATION = "Customers, staff, suppliers, conversations, campaigns and creative work all lived in different systems.";
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-luxury-review-v4.mp4`;

const MEDIA = {
  customers: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  staff: `${ORG}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  suppliers: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  manager: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  score: `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`,
};

const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("SCENE_6_V4_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (c) => stdout.push(c));
    child.stderr.on("data", (c) => stderr.push(c));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
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
    metadata: { module: "CREATIVE", operation: "AVANTIQO_INVESTOR_SCENE_6_LUXURY_REVIEW_V4", brand: "Avantiqo", speaker_policy: "ONE_FOUNDER_VOICE_ENTIRE_FILM" },
    category: "AI",
  });
  const base64 = findAudio(execution);
  if (!base64) throw new Error("SCENE_6_TTS_EMPTY");
  await fs.writeFile(localPath, Buffer.from(base64, "base64"));
}

async function duration(ffprobe, localPath) {
  const raw = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", localPath], 60000);
  const value = Number(String(raw || "").trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error("SCENE_6_DURATION_INVALID");
  return value;
}

async function normalize(ffmpeg, source, output, seconds, sourceIn = 0) {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push("-stream_loop", "-1", "-i", source, "-t", String(seconds), "-an", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-r", String(FPS), "-movflags", "+faststart", output);
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
    "-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", rgba,
    "-t", String(seconds),
    "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='4*sin(t*0.67)':y='3*sin(t*0.49)':shortest=1,format=yuv420p[v]`,
    "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-r", String(FPS), "-movflags", "+faststart", output,
  );
  await run(ffmpeg, args);
}

async function concat(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "scene6.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", "-movflags", "+faststart", output]);
}

function channelsSvg() {
  const nodes = [["whatsapp",135,230,220],["line",410,145,220],["messenger",690,230,220],["instagram",970,145,220],["facebook",1250,230,220],["googleReviews",1510,145,270]];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity="0.075"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse cx="960" cy="430" rx="820" ry="340" fill="url(#g)"/>${nodes.map(([key,x,y,w])=>`<g transform="translate(${x} ${y})"><rect width="${w}" height="86" rx="31" fill="#05070a" fill-opacity="0.30" stroke="#e8edf2" stroke-opacity="0.20"/><path d="M24 10 H${w-34}" stroke="#fff" stroke-opacity="0.17"/>${investorBrandBadge(key,{x:14,y:18,width:w-28,height:50})}</g>`).join("")}</svg>`);
}

function campaignSvg() {
  const keys = ["facebook","instagram","googleAds","tiktok","youtube","linkedin"];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<linearGradient id="e"><stop offset="0" stop-color="#fff" stop-opacity="0.42"/><stop offset="0.5" stop-color="#bcc3cb" stop-opacity="0.11"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0.30"/></linearGradient></defs><path d="M140 520 C520 260 1400 260 1780 520" fill="none" stroke="url(#e)" stroke-opacity="0.30" stroke-width="1.5"/>${keys.map((key,i)=>`<g transform="translate(${120+i*282} ${i%2===0?210:138})"><rect width="224" height="88" rx="32" fill="#05070a" fill-opacity="0.29" stroke="#e8edf2" stroke-opacity="0.19"/><path d="M22 11 H192" stroke="#fff" stroke-opacity="0.16"/>${investorBrandBadge(key,{x:14,y:19,width:196,height:50})}</g>`).join("")}</svg>`);
}

function creativeSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.35" stop-color="#aab1ba" stop-opacity="0.05"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0.05"/></linearGradient><radialGradient id="metal"><stop offset="0" stop-color="#f4f1e9"/><stop offset="0.25" stop-color="#9da4ac"/><stop offset="0.5" stop-color="#242930"/><stop offset="0.72" stop-color="#d6a66a"/><stop offset="1" stop-color="#050607"/></radialGradient><linearGradient id="edge"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#d6a66a" stop-opacity="0.32"/></linearGradient></defs><g transform="translate(500 125)"><rect width="920" height="720" rx="44" fill="#040506" fill-opacity="0.42" stroke="url(#edge)" stroke-width="1.3"/><rect x="20" y="20" width="880" height="680" rx="34" fill="url(#glass)"/><g transform="translate(460 385) rotate(-16)"><ellipse rx="190" ry="265" fill="url(#metal)"/><ellipse cx="-24" cy="-42" rx="105" ry="170" fill="#080a0d" fill-opacity="0.34"/><path d="M-92 -174 C-12 -255 116 -205 146 -90" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="4"/><path d="M-124 180 C-45 255 92 232 148 128" fill="none" stroke="#d6a66a" stroke-opacity="0.58" stroke-width="5"/></g><path d="M70 72 H842" stroke="#fff" stroke-opacity="0.14"/><circle cx="842" cy="72" r="4" fill="#d6a66a"/></g></svg>`);
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene6-v4-"));
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
    const seconds = Math.max(5.1, Math.min(7.5, (await duration(ffprobe, local.voice)) + 0.12));
    const weights = [0.155,0.155,0.155,0.18,0.18,0.175];
    const durations = weights.map((weight) => seconds * weight);
    durations[5] += seconds - durations.reduce((sum, value) => sum + value, 0);

    const channels = await svgToRaw(directory, "channels", channelsSvg());
    const campaigns = await svgToRaw(directory, "campaigns", campaignSvg());
    const creative = await svgToRaw(directory, "creative", creativeSvg());
    const clips = Array.from({ length: 6 }, (_, index) => path.join(directory, `scene6-${index}.mp4`));
    await normalize(ffmpeg, local.customers, clips[0], durations[0], 0.35);
    await normalize(ffmpeg, local.staff, clips[1], durations[1], 0.45);
    await normalize(ffmpeg, local.suppliers, clips[2], durations[2], 0.40);
    await overlayRaw(ffmpeg, local.manager, channels, clips[3], durations[3], 0.25);
    await overlayRaw(ffmpeg, local.manager, campaigns, clips[4], durations[4], 1.55);
    await overlayRaw(ffmpeg, local.manager, creative, clips[5], durations[5], 3.0);

    const picture = path.join(directory, "scene6-picture.mp4");
    const final = path.join(directory, "scene6-final.mp4");
    await concat(ffmpeg, clips, picture, directory);
    const audioFilter = `[1:a]asetpts=PTS-STARTPTS,volume=1,apad,atrim=duration=${seconds}[voice];[2:a]atrim=start=15.61:duration=${seconds},asetpts=PTS-STARTPTS,volume=0.14,apad,atrim=duration=${seconds}[score];[voice][score]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${seconds}[a]`;
    await run(ffmpeg, ["-y", "-i", picture, "-i", local.voice, "-i", local.score, "-filter_complex", audioFilter, "-map", "0:v:0", "-map", "[a]", "-t", String(seconds), "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", final]);

    const bytes = await fs.readFile(final);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const { error } = await supabase.storage.from(BUCKET).upload(OUTPUT, bytes, {
      contentType: "video/mp4", upsert: true, cacheControl: "3600",
      metadata: {
        contract: CONTRACT,
        organization_id: ORG,
        creative_project_id: PROJECT,
        scene: "6",
        role: "FRAGMENTATION_MONTAGE_REVISED",
        narration: NARRATION,
        treatment: "FOOTAGE_FIRST_LUXURY_OPTICAL_GLASS",
        communication_marks: "WHATSAPP,LINE,MESSENGER,INSTAGRAM,FACEBOOK,GOOGLE_REVIEWS",
        campaign_marks: "FACEBOOK,INSTAGRAM,GOOGLE_ADS,TIKTOK,YOUTUBE,LINKEDIN",
        no_churchill: "true",
        print_screen_used: "false",
        publication_authorized: "false",
        sha256,
      },
    });
    if (error) throw error;
    return { success: true, contract: CONTRACT, output_ready: true, output_path: OUTPUT, duration_seconds: seconds, bytes: bytes.length, sha256, signed_url: await signedUrl(OUTPUT) };
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
    if (action === "signed") {
      const ready = await exists(OUTPUT);
      return json({ success: true, output_ready: ready, output_path: OUTPUT, signed_url: ready ? await signedUrl(OUTPUT) : null });
    }
    return json({ success: true, contract: CONTRACT, output_ready: await exists(OUTPUT), output_path: OUTPUT, narration: NARRATION, no_churchill: true, no_print_screens: true, luxury_optical_glass: true });
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
