import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_V10_SYNTHETIC_INTELLIGENCE_FINAL";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const PROLOGUE_SECONDS = 8;
const PROLOGUE_FRAMES = 192;
const V9_FRAMES = 5700;
const TARGET_FRAMES = PROLOGUE_FRAMES + V9_FRAMES;
const TARGET_DURATION = TARGET_FRAMES / FPS;
const V9_MASTER_PATH = `${ORG}/${PROJECT}/spatial-master-v9/avantiqo-investor-film-v9-intelligence-237.5s.mp4`;
const CANONICAL_LOGO_PATH = `${ORG}/unassigned/5a068b01-d435-412d-b288-d138c33a7f98-avantiqo-logo.png`;
const OUTPUT_PATH = `${ORG}/${PROJECT}/spatial-master-v10/avantiqo-investor-film-v10-synthetic-intelligence-245.5s.mp4`;
const X264_PARAMS = "threads=1:lookahead_threads=0:sync-lookahead=0:rc-lookahead=0:bframes=0";

function run(command, args, timeoutMs = 760000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("INVESTOR_V10_MEDIA_TIMEOUT"));
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
      if (code !== 0) reject(new Error(err.slice(-18000) || `MEDIA_EXIT_${code}`));
      else resolve(out);
    });
  });
}

async function exists(storagePath) {
  const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((entry) => entry.name === name);
}

async function signed(storagePath, expires = 21600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`INVESTOR_V10_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function download(url, target) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`INVESTOR_V10_DOWNLOAD_FAILED:${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStreamCompat(target));
}

function createWriteStreamCompat(target) {
  const { createWriteStream } = require("node:fs");
  return createWriteStream(target);
}

async function sha256File(localPath) {
  const hash = crypto.createHash("sha256");
  const stream = createReadStream(localPath, { highWaterMark: 1024 * 1024 });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

function requireServerEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`INVESTOR_V10_ENV_MISSING:${name}`);
  return value;
}

async function uploadVideo(localPath) {
  const stat = await fs.stat(localPath);
  const checksum = await sha256File(localPath);
  const supabaseUrl = requireServerEnv("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const serviceRole = requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
  const encodedPath = OUTPUT_PATH.split("/").map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodedPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Cache-Control": "max-age=3600",
      "x-upsert": "true",
    },
    body: createReadStream(localPath, { highWaterMark: 1024 * 1024 }),
    duplex: "half",
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`INVESTOR_V10_STORAGE_UPLOAD_FAILED:${response.status}:${detail.slice(0, 1200)}`);
  }
  return { checksum, bytes: stat.size };
}

async function probe(ffprobe, input, timeoutMs = 150000) {
  const raw = await run(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,sample_rate,channels",
    "-of", "json", input,
  ], timeoutMs);
  return JSON.parse(raw || "{}");
}

function signalFieldSvg() {
  const nodes = [
    [230,230,"TRANSACTION"], [510,160,"CUSTOMER"], [830,245,"INVENTORY"],
    [1110,155,"PEOPLE"], [1395,260,"OPERATIONS"], [1670,185,"MARKETING"],
    [350,690,"SUPPLY"], [720,780,"CASH"], [1160,720,"SERVICE"], [1530,770,"DECISION"],
  ];
  const lines = nodes.map(([x,y],index) => {
    const nx = 960 + Math.cos(index * .83) * (180 + (index % 3) * 55);
    const ny = 540 + Math.sin(index * .71) * (100 + (index % 2) * 80);
    return `<path d="M${x} ${y} C${(x+nx)/2} ${y}, ${(x+nx)/2} ${ny}, ${nx} ${ny}" fill="none" stroke="#e4e8ec" stroke-opacity=".12" stroke-width="1.3"/>`;
  }).join("");
  const dots = nodes.map(([x,y,label],index) => `<g transform="translate(${x} ${y})"><circle r="${index%3===0?5:3.5}" fill="#eef2f6" fill-opacity=".62"/><circle r="18" fill="none" stroke="#eef2f6" stroke-opacity=".08"/><text x="14" y="4" fill="#b8bec6" fill-opacity=".48" font-family="Helvetica,Arial,sans-serif" font-size="10" letter-spacing="2">${label}</text></g>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="r"><stop offset="0" stop-color="#f2f4f6" stop-opacity=".11"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>${lines}${dots}<ellipse cx="960" cy="540" rx="410" ry="255" fill="url(#r)"/></svg>`);
}

function synthesisSvg() {
  const rings = [78,132,204,294].map((r,index) => `<ellipse cx="960" cy="540" rx="${r*1.55}" ry="${r}" fill="none" stroke="${index===0?'#ffffff':'#cbd1d7'}" stroke-opacity="${.28-index*.045}" stroke-width="${index===0?1.8:1}"/>`).join("");
  const spokes = Array.from({ length: 18 }, (_, index) => {
    const angle = Math.PI * 2 * index / 18;
    const x = 960 + Math.cos(angle) * 505;
    const y = 540 + Math.sin(angle) * 285;
    return `<path d="M960 540 C${960+Math.cos(angle)*180} ${540+Math.sin(angle)*95}, ${960+Math.cos(angle)*330} ${540+Math.sin(angle)*190}, ${x} ${y}" fill="none" stroke="#e9edf0" stroke-opacity=".11" stroke-width="1"/>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><radialGradient id="core"><stop offset="0" stop-color="#ffffff" stop-opacity=".2"/><stop offset=".35" stop-color="#c8cdd3" stop-opacity=".07"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="silver"><stop offset="0" stop-color="#f7f8f9"/><stop offset=".45" stop-color="#9ea6af"/><stop offset=".72" stop-color="#ffffff"/><stop offset="1" stop-color="#5d646d"/></linearGradient></defs><ellipse cx="960" cy="540" rx="530" ry="310" fill="url(#core)"/>${spokes}${rings}<circle cx="960" cy="540" r="8" fill="url(#silver)"/><circle cx="960" cy="540" r="34" fill="none" stroke="#d6a66a" stroke-opacity=".18"/></svg>`);
}

function titleSvg() {
  const text = "SYNTHETIC INTELLIGENCE";
  const layers = Array.from({ length: 9 }, (_, index) => `<text x="960" y="542" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="88" font-weight="600" letter-spacing="7" fill="#252a30" fill-opacity="${.32-index*.02}" transform="translate(${index*1.8} ${index*1.35})">${text}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="platinum" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".28" stop-color="#cfd4da"/><stop offset=".55" stop-color="#7f8790"/><stop offset=".76" stop-color="#eef1f4"/><stop offset="1" stop-color="#858c94"/></linearGradient><filter id="soft"><feGaussianBlur stdDeviation="9"/></filter></defs><rect x="610" y="394" width="700" height="270" rx="60" fill="#ffffff" fill-opacity=".018" stroke="#f0f3f5" stroke-opacity=".05"/>${layers}<text x="960" y="542" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="88" font-weight="600" letter-spacing="7" fill="url(#platinum)">${text}</text><text x="960" y="610" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="20" font-weight="500" letter-spacing="10" fill="#d9dde1" fill-opacity=".74">FOR BUSINESS</text><rect x="818" y="653" width="284" height="1" fill="#d6a66a" fill-opacity=".28"/></svg>`);
}

async function png(directory, name, svg) {
  const target = path.join(directory, `${name}.png`);
  await sharp(svg).png().toFile(target);
  return target;
}

async function renderPrologue(ffmpeg, ffprobe, directory) {
  const [logoUrl, signalPath, synthesisPath, titlePath] = await Promise.all([
    signed(CANONICAL_LOGO_PATH),
    png(directory, "signals", signalFieldSvg()),
    png(directory, "synthesis", synthesisSvg()),
    png(directory, "title", titleSvg()),
  ]);
  const output = path.join(directory, "synthetic-intelligence-prologue.mp4");
  await run(ffmpeg, [
    "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-f", "lavfi", "-i", `color=c=#020304:s=1920x1080:r=${FPS}:d=${PROLOGUE_SECONDS}`,
    "-loop", "1", "-framerate", String(FPS), "-i", signalPath,
    "-loop", "1", "-framerate", String(FPS), "-i", synthesisPath,
    "-loop", "1", "-framerate", String(FPS), "-i", titlePath,
    "-loop", "1", "-framerate", String(FPS), "-i", logoUrl,
    "-f", "lavfi", "-i", `sine=frequency=42:sample_rate=48000:duration=${PROLOGUE_SECONDS}`,
    "-f", "lavfi", "-i", `sine=frequency=96:sample_rate=48000:duration=${PROLOGUE_SECONDS}`,
    "-filter_complex",
    `[1:v]format=rgba,scale=1920:1080,fade=t=in:st=.35:d=1.0:alpha=1,fade=t=out:st=4.5:d=.8:alpha=1,zoompan=z='1+0.00018*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}[signals];` +
    `[2:v]format=rgba,scale=1920:1080,fade=t=in:st=1.8:d=.85:alpha=1,fade=t=out:st=6.35:d=.65:alpha=1[net];` +
    `[3:v]format=rgba,scale=1920:1080,fade=t=in:st=4.55:d=.7:alpha=1,fade=t=out:st=7.0:d=.45:alpha=1[title];` +
    `[4:v]format=rgba,scale=330:-1,fade=t=in:st=7.08:d=.24:alpha=1,fade=t=out:st=7.72:d=.2:alpha=1[logo];` +
    `[0:v][signals]overlay=x='4*sin(t*.31)':y='3*sin(t*.21)':enable='between(t,.3,5.4)'[v1];` +
    `[v1][net]overlay=x='2*sin(t*.2)':y='2*sin(t*.17)':enable='between(t,1.7,7.0)'[v2];` +
    `[v2][title]overlay=0:0:enable='between(t,4.45,7.35)'[v3];` +
    `[v3][logo]overlay=x='(W-w)/2':y='(H-h)/2':enable='between(t,7.0,7.9)',fade=t=out:st=7.72:d=.28,format=yuv420p[v];` +
    `[5:a]volume=.14,afade=t=in:st=0:d=1.6,afade=t=out:st=7.15:d=.65[low];` +
    `[6:a]volume=.035,afade=t=in:st=2.0:d=1.3,afade=t=out:st=6.9:d=.8[high];` +
    `[low][high]amix=inputs=2:duration=longest,alimiter=limit=.8[a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS,
    "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(PROLOGUE_FRAMES),
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-t", String(PROLOGUE_SECONDS), "-movflags", "+faststart", output,
  ], 260000);

  const media = await probe(ffprobe, output, 90000);
  const video = (media.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (media.streams || []).find((stream) => stream.codec_type === "audio");
  if (!video || !audio) throw new Error("INVESTOR_V10_PROLOGUE_AV_REQUIRED");
  if (Number(video.nb_read_frames || 0) !== PROLOGUE_FRAMES) throw new Error(`INVESTOR_V10_PROLOGUE_FRAMES_INVALID:${video.nb_read_frames}`);
  if ((video.r_frame_rate || video.avg_frame_rate) !== "24/1") throw new Error(`INVESTOR_V10_PROLOGUE_FPS_INVALID:${video.r_frame_rate}`);
  return output;
}

async function concatCopy(ffmpeg, directory, prologue, v9Local) {
  const list = path.join(directory, "v10-concat.txt");
  const output = path.join(directory, "v10-copy.mp4");
  await fs.writeFile(list, `file '${prologue.replace(/'/g, "'\\''")}'\nfile '${v9Local.replace(/'/g, "'\\''")}'`, "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-fflags", "+genpts", "-movflags", "+faststart", output], 180000);
  return output;
}

async function concatFallback(ffmpeg, directory, prologue, v9Local) {
  const output = path.join(directory, "v10-reencoded.mp4");
  await run(ffmpeg, [
    "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-i", prologue, "-i", v9Local,
    "-filter_complex", `[0:v]fps=${FPS},setpts=PTS-STARTPTS[v0];[1:v]fps=${FPS},setpts=PTS-STARTPTS[v1];[v0][0:a][v1][1:a]concat=n=2:v=1:a=1[v][a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
    "-frames:v", String(TARGET_FRAMES), "-t", String(TARGET_DURATION), "-movflags", "+faststart", output,
  ], 760000);
  return output;
}

async function validateFinal(ffprobe, output) {
  const media = await probe(ffprobe, output, 180000);
  const video = (media.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (media.streams || []).find((stream) => stream.codec_type === "audio");
  const frames = Number(video?.nb_read_frames || 0);
  const duration = Number(media.format?.duration || 0);
  const frameRate = video?.r_frame_rate || video?.avg_frame_rate || null;
  if (!video || !audio) throw new Error("INVESTOR_V10_FINAL_AV_REQUIRED");
  if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`INVESTOR_V10_DIMENSIONS_INVALID:${video.width}x${video.height}`);
  if (frameRate !== "24/1") throw new Error(`INVESTOR_V10_FPS_INVALID:${frameRate}`);
  if (frames !== TARGET_FRAMES) throw new Error(`INVESTOR_V10_FRAMES_INVALID:${frames}/${TARGET_FRAMES}`);
  if (Math.abs(duration - TARGET_DURATION) > .12) throw new Error(`INVESTOR_V10_DURATION_INVALID:${duration}`);
  return { width: 1920, height: 1080, frame_rate: frameRate, exact_frames: frames, duration_seconds: duration, video_codec: video.codec_name, audio_codec: audio.codec_name, sample_rate: Number(audio.sample_rate || 0), channels: Number(audio.channels || 0) };
}

async function updateProject(state) {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("metadata").eq("id", PROJECT).eq("organization_id", ORG).maybeSingle();
  if (error) throw error;
  const { error: updateError } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...(data?.metadata || {}), synthetic_intelligence_master_v10: state }, updated_at: new Date().toISOString() }).eq("id", PROJECT).eq("organization_id", ORG);
  if (updateError) throw updateError;
}

export const AvantiqoInvestorFilmSyntheticIntelligenceV10Runtime = Object.freeze({
  CONTRACT,
  ORG,
  PROJECT,
  BUCKET,
  OUTPUT_PATH,
  TARGET_FRAMES,
  TARGET_DURATION,
  async status() {
    return {
      contract: CONTRACT,
      output_path: OUTPUT_PATH,
      final_ready: await exists(OUTPUT_PATH),
      v9_ready: await exists(V9_MASTER_PATH),
      canonical_logo_ready: await exists(CANONICAL_LOGO_PATH),
      exact_frames: TARGET_FRAMES,
      duration_seconds: TARGET_DURATION,
      prologue_seconds: PROLOGUE_SECONDS,
      image_generation_used: false,
      synthetic_product_ui_used: false,
      canonical_logo_reinterpreted: false,
    };
  },
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("INVESTOR_V10_MEDIA_BINARY_NOT_READY");
    if (!(await exists(V9_MASTER_PATH))) throw new Error("INVESTOR_V10_V9_MASTER_NOT_READY");
    if (!(await exists(CANONICAL_LOGO_PATH))) throw new Error("INVESTOR_V10_CANONICAL_LOGO_NOT_READY");

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v10-final-"));
    try {
      const prologue = await renderPrologue(ffmpeg, ffprobe, directory);
      const v9Local = path.join(directory, "v9-master.mp4");
      await download(await signed(V9_MASTER_PATH, 21600), v9Local);

      let output;
      let assembly = "stream_copy";
      try {
        output = await concatCopy(ffmpeg, directory, prologue, v9Local);
        await validateFinal(ffprobe, output);
      } catch {
        assembly = "reencoded_fallback";
        output = await concatFallback(ffmpeg, directory, prologue, v9Local);
      }

      const technical_qc = await validateFinal(ffprobe, output);
      const stored = await uploadVideo(output);
      const state = {
        contract: CONTRACT,
        status: "RENDERED_REVIEW_REQUIRED",
        storage_path: OUTPUT_PATH,
        checksum: stored.checksum,
        bytes: stored.bytes,
        exact_frames: technical_qc.exact_frames,
        duration_seconds: technical_qc.duration_seconds,
        frame_rate: technical_qc.frame_rate,
        prologue_seconds: PROLOGUE_SECONDS,
        v9_body_seconds: 237.5,
        synthetic_intelligence_title: true,
        synthetic_intelligence_for_business: true,
        deterministic_typography: true,
        image_generation_used: false,
        synthetic_product_ui_used: false,
        canonical_logo_reinterpreted: false,
        canonical_logo_used_only_as_exact_transition_asset: true,
        assembly,
        technical_qc,
        updated_at: new Date().toISOString(),
      };
      await updateProject(state);
      return { success: true, ...state, signed_url: await signed(OUTPUT_PATH, 86400) };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
});
