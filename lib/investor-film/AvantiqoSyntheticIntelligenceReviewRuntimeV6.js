import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { normalizeCreativeStillImage, creativeRawStillInputArgs } from "@/lib/creative/media/runtime/CreativeStillImageInputRuntime";

const CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_REVIEW_V6";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const FRAMES = 192;
const DURATION = 8;
const APPROVED_LOGO_FILM = `${ORG}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/synthetic-intelligence-v6-review.mp4`;
const X264_PARAMS = "threads=1:lookahead_threads=0:sync-lookahead=0:rc-lookahead=0:bframes=0";

const GLYPHS = Object.freeze({
  A:[[0,1,.5,0],[.5,0,1,1],[.2,.62,.8,.62]],
  B:[[0,0,0,1],[0,0,.72,0],[.72,0,.92,.18],[.92,.18,.72,.48],[.72,.48,0,.48],[.72,.48,.94,.66],[.94,.66,.74,1],[.74,1,0,1]],
  C:[[1,0,.15,0],[.15,0,0,.15],[0,.15,0,.85],[0,.85,.15,1],[.15,1,1,1]],
  E:[[1,0,0,0],[0,0,0,1],[0,1,1,1],[0,.5,.78,.5]],
  F:[[0,1,0,0],[0,0,1,0],[0,.5,.78,.5]],
  G:[[1,0,.15,0],[.15,0,0,.15],[0,.15,0,.85],[0,.85,.15,1],[.15,1,1,1],[1,1,1,.56],[1,.56,.58,.56]],
  H:[[0,0,0,1],[1,0,1,1],[0,.5,1,.5]],
  I:[[.15,0,.85,0],[.5,0,.5,1],[.15,1,.85,1]],
  L:[[0,0,0,1],[0,1,1,1]],
  N:[[0,1,0,0],[0,0,1,1],[1,1,1,0]],
  O:[[.15,0,.85,0],[.85,0,1,.15],[1,.15,1,.85],[1,.85,.85,1],[.85,1,.15,1],[.15,1,0,.85],[0,.85,0,.15],[0,.15,.15,0]],
  R:[[0,1,0,0],[0,0,.72,0],[.72,0,.94,.2],[.94,.2,.72,.5],[.72,.5,0,.5],[.52,.5,1,1]],
  S:[[1,0,.15,0],[.15,0,0,.15],[0,.15,.15,.48],[.15,.48,.85,.48],[.85,.48,1,.65],[1,.65,.85,1],[.85,1,0,1]],
  T:[[0,0,1,0],[.5,0,.5,1]],
  U:[[0,0,0,.82],[0,.82,.18,1],[.18,1,.82,1],[.82,1,1,.82],[1,.82,1,0]],
  Y:[[0,0,.5,.5],[1,0,.5,.5],[.5,.5,.5,1]],
});

function run(command, args, timeoutMs = 360000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1", OPENBLAS_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
    });
    const out = [], err = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("SYNTHETIC_INTELLIGENCE_REVIEW_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", c => out.push(c));
    child.stderr.on("data", c => err.push(c));
    child.on("error", e => { clearTimeout(timer); if (!settled) { settled = true; reject(e); } });
    child.on("close", code => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error(Buffer.concat(err).toString("utf8").slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}

async function exists(storagePath) {
  const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some(row => row.name === name);
}

async function signed(storagePath, seconds = 3600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) hash.update(chunk);
  return hash.digest("hex");
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const checksum = await sha256File(localPath);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(OUTPUT, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "900",
    metadata: {
      contract: CONTRACT,
      review_only: true,
      canonical_master_untouched: true,
      approved_avantiqo_3d_logo_motion: true,
      radar_diagram_used: false,
      network_diagram_used: false,
      social_icons_used: false,
      churchill_assets_used: false,
      image_generation_used: false,
      server_font_dependency: false,
      checksum,
    },
  });
  if (error) throw error;
  return { path: OUTPUT, bytes: bytes.length, checksum, signed_url: await signed(OUTPUT, 3600) };
}

function linePath(word, { x, y, height, tracking = 0.31, space = 0.70 }) {
  const glyphWidth = height * 0.58;
  const advance = glyphWidth * (1 + tracking);
  const spaceAdvance = glyphWidth * space;
  let cursor = x;
  let d = "";
  for (const char of word) {
    if (char === " ") { cursor += spaceAdvance; continue; }
    for (const [x1,y1,x2,y2] of (GLYPHS[char] || [])) {
      d += `M${(cursor + x1 * glyphWidth).toFixed(1)} ${(y + y1 * height).toFixed(1)} L${(cursor + x2 * glyphWidth).toFixed(1)} ${(y + y2 * height).toFixed(1)} `;
    }
    cursor += advance;
  }
  return { d: d.trim(), width: cursor - x };
}

function titleSvg() {
  const mainMeasure = linePath("SYNTHETIC INTELLIGENCE", { x:0, y:0, height:90, tracking:0.29, space:0.72 });
  const subMeasure = linePath("FOR BUSINESS", { x:0, y:0, height:28, tracking:0.40, space:0.78 });
  const main = linePath("SYNTHETIC INTELLIGENCE", { x:(1920-mainMeasure.width)/2, y:430, height:90, tracking:0.29, space:0.72 });
  const sub = linePath("FOR BUSINESS", { x:(1920-subMeasure.width)/2, y:582, height:28, tracking:0.40, space:0.78 });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs>
      <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.18" stop-color="#9199a2"/><stop offset="0.42" stop-color="#f4f6f7"/><stop offset="0.62" stop-color="#656e77"/><stop offset="0.82" stop-color="#d9dde1"/><stop offset="1" stop-color="#7b838c"/></linearGradient>
      <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#dce1e5" stop-opacity=".12"/><stop offset=".5" stop-color="#b8bec5" stop-opacity=".024"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <linearGradient id="champ" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D6A66A" stop-opacity="0"/><stop offset=".5" stop-color="#D6A66A" stop-opacity=".52"/><stop offset="1" stop-color="#D6A66A" stop-opacity="0"/></linearGradient>
    </defs>
    <ellipse cx="960" cy="530" rx="700" ry="270" fill="url(#halo)"/>
    <path d="${main.d}" transform="translate(7 9)" fill="none" stroke="#020304" stroke-opacity=".82" stroke-width="9" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="${main.d}" fill="none" stroke="#4b5259" stroke-opacity=".72" stroke-width="6.4" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="${main.d}" transform="translate(-1 -1)" fill="none" stroke="url(#metal)" stroke-width="2.8" stroke-linecap="square" stroke-linejoin="miter"/>
    <path d="${sub.d}" transform="translate(2 3)" fill="none" stroke="#050607" stroke-opacity=".8" stroke-width="4"/>
    <path d="${sub.d}" fill="none" stroke="#e0e3e6" stroke-opacity=".84" stroke-width="1.55"/>
    <rect x="762" y="660" width="396" height="1.2" fill="url(#champ)"/>
  </svg>`);
}

function atmosphereSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#f5f6f7" stop-opacity=".026"/><stop offset=".52" stop-color="#D6A66A" stop-opacity=".035"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <radialGradient id="v" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".58"/></radialGradient>
    </defs>
    <path d="M-240 1060 L550 0 H830 L80 1080Z" fill="url(#beam)"/>
    <path d="M2050 120 L1380 1080 H1190 L1810 0Z" fill="url(#beam)" opacity=".62"/>
    <rect width="1920" height="1080" fill="url(#v)"/>
  </svg>`);
}

async function renderLocal() {
  if (!(await exists(APPROVED_LOGO_FILM))) throw new Error("APPROVED_3D_LOGO_FILM_NOT_READY");
  const ffmpeg = await resolveCreativeFfmpegPath();
  const ffprobe = await resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("MEDIA_BINARY_NOT_READY");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "synthetic-intelligence-v6-"));
  try {
    const [title, atmosphere, logoUrl] = await Promise.all([
      normalizeCreativeStillImage({ svg_buffer:titleSvg(), output_directory:directory, name:"title", width:1920, height:1080, fit:"fill" }),
      normalizeCreativeStillImage({ svg_buffer:atmosphereSvg(), output_directory:directory, name:"atmosphere", width:1920, height:1080, fit:"fill" }),
      signed(APPROVED_LOGO_FILM, 21600),
    ]);
    const output = path.join(directory, "synthetic-intelligence-v6.mp4");
    const filter = [
      `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS},eq=contrast=1.10:saturation=0.72:brightness=-0.045,vignette=PI/6,trim=end_frame=${FRAMES},setpts=N/(${FPS}*TB)[base]`,
      `[2:v]format=rgba,colorchannelmixer=aa=0.78[atm]`,
      `[base][atm]overlay=0:0:format=auto[b1]`,
      `[1:v]format=rgba,fade=t=in:st=2.05:d=0.72:alpha=1,fade=t=out:st=6.55:d=0.60:alpha=1[title]`,
      `[b1][title]overlay=x='2*sin(t*0.12)':y='1.4*sin(t*0.10)':enable='between(t,1.85,7.25)',fade=t=in:st=0:d=0.32,fade=t=out:st=7.66:d=0.28,format=yuv420p[v]`,
      `[3:a]volume=0.075,afade=t=in:st=0:d=1.1,afade=t=out:st=6.85:d=0.75[a]`,
    ].join(";");
    await run(ffmpeg, [
      "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
      "-stream_loop", "-1", "-i", logoUrl,
      ...creativeRawStillInputArgs(title, { fps:FPS, loop:true }),
      ...creativeRawStillInputArgs(atmosphere, { fps:FPS, loop:true }),
      "-f", "lavfi", "-i", "sine=frequency=43:sample_rate=48000:duration=8",
      "-filter_complex", filter,
      "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "15", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(FRAMES),
      "-c:a", "aac", "-b:a", "224k", "-ar", "48000", "-ac", "2", "-t", String(DURATION), "-movflags", "+faststart", output,
    ]);
    const raw = await run(ffprobe, ["-v","error","-count_frames","-show_entries","format=duration:stream=codec_type,width,height,r_frame_rate,nb_read_frames","-of","json",output], 120000);
    const media = JSON.parse(raw || "{}");
    const video = (media.streams || []).find(s => s.codec_type === "video");
    const audio = (media.streams || []).find(s => s.codec_type === "audio");
    if (!video || !audio) throw new Error("SYNTHETIC_INTELLIGENCE_REVIEW_AV_REQUIRED");
    if (Number(video.nb_read_frames || 0) !== FRAMES) throw new Error(`SYNTHETIC_INTELLIGENCE_REVIEW_FRAMES_INVALID:${video.nb_read_frames}`);
    return { directory, output, technical_qc:{ width:Number(video.width), height:Number(video.height), frame_rate:video.r_frame_rate, exact_frames:Number(video.nb_read_frames), duration_seconds:Number(media.format?.duration || 0) } };
  } catch (error) {
    await fs.rm(directory, { recursive:true, force:true }).catch(() => null);
    throw error;
  }
}

export const AvantiqoSyntheticIntelligenceReviewRuntimeV6 = Object.freeze({
  CONTRACT,
  OUTPUT,
  async status() {
    return {
      success:true,
      contract:CONTRACT,
      approved_logo_film_ready:await exists(APPROVED_LOGO_FILM),
      preview_ready:await exists(OUTPUT),
      exact_frames:FRAMES,
      duration_seconds:DURATION,
      review_only:true,
      canonical_master_untouched:true,
    };
  },
  async render() {
    const rendered = await renderLocal();
    try {
      const stored = await upload(rendered.output);
      return {
        success:true,
        contract:CONTRACT,
        status:"RENDERED_REVIEW_REQUIRED",
        ...stored,
        technical_qc:rendered.technical_qc,
        guarantees:{
          synthetic_intelligence_first:true,
          approved_3d_logo_film_used:true,
          radar_diagram_used:false,
          network_diagram_used:false,
          social_icons_used:false,
          churchill_assets_used:false,
          studio_assets_used:false,
          image_generation_used:false,
          server_font_dependency:false,
          canonical_master_untouched:true,
        },
      };
    } finally {
      await fs.rm(rendered.directory, { recursive:true, force:true }).catch(() => null);
    }
  },
});