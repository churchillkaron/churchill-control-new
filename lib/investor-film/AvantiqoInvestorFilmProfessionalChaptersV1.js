import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { normalizeCreativeStillImage, creativeRawStillInputArgs } from "@/lib/creative/media/runtime/CreativeStillImageInputRuntime";
import { investorBrandDefs, investorBrandMark, INVESTOR_BRANDS } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_PROFESSIONAL_CHAPTERS_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const COMM_FRAMES = 911;
const STUDIO_FRAMES = 881;
const COMM_OUTPUT = `${ORG}/avantiqo-investor-film-20260822/communication-cinematic-professional-v1-911f.mp4`;
const STUDIO_OUTPUT = `${ORG}/avantiqo-investor-film-20260822/studio-marketing-professional-v1-881f.mp4`;
const COMM_PREVIEW = `${ORG}/${PROJECT}/scene-previews-20260822/communication-cinematic-professional-v1.mp4`;
const STUDIO_PREVIEW = `${ORG}/${PROJECT}/scene-previews-20260822/studio-marketing-professional-v1.mp4`;
const LOGO_PATH = `${ORG}/unassigned/5a068b01-d435-412d-b288-d138c33a7f98-avantiqo-logo.png`;
const POSTER_PATH = `${ORG}/campaigns/9f9cdf6f-5a6d-4d3a-8df0-b091ea266ecc/f9a260d4-b83b-4022-8844-9a1aace6c06c-03-churchill.png`;
const STUDIO_VIDEO_PATH = `${ORG}/1460b8b2-ef56-4548-8c58-ded3c0d1bed7/e5e0935c-10b7-4206-9141-dd96c4e742d0/e5e0935c-10b7-4206-9141-dd96c4e742d0.mp4`;
const COMM_SOURCES = Object.freeze([
  { path: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`, frames: 120 },
  { path: `${ORG}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`, frames: 168 },
  { path: `${ORG}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`, frames: 156 },
  { path: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`, frames: 144 },
  { path: `${ORG}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`, frames: 203 },
  { path: `${ORG}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`, frames: 120 },
]);
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
      if (!settled) { settled = true; reject(new Error("PROFESSIONAL_CHAPTER_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
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

async function signed(storagePath, expires = 21600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`PROFESSIONAL_CHAPTER_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function downloadBuffer(storagePath) {
  const response = await fetch(await signed(storagePath), { cache: "no-store" });
  if (!response.ok) throw new Error(`PROFESSIONAL_CHAPTER_DOWNLOAD_FAILED:${response.status}:${storagePath}`);
  return Buffer.from(await response.arrayBuffer());
}

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      checksum,
      generated_image_used: false,
      generated_product_ui_used: false,
      system_font_dependency: false,
      ...metadata,
    },
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length, checksum, signed_url: await signed(storagePath, 86400) };
}

async function probe(ffprobe, input) {
  const raw = await run(ffprobe, [
    "-v", "error", "-count_frames",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames",
    "-of", "json", input,
  ], 160000);
  return JSON.parse(raw || "{}");
}

function assertVideo(media, frames, label) {
  const video = (media.streams || []).find((stream) => stream.codec_type === "video");
  if (!video) throw new Error(`${label}_VIDEO_MISSING`);
  if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`${label}_DIMENSIONS_INVALID:${video.width}x${video.height}`);
  if ((video.r_frame_rate || "") !== "24/1") throw new Error(`${label}_FPS_INVALID:${video.r_frame_rate}`);
  if (Number(video.nb_read_frames || 0) !== frames) throw new Error(`${label}_FRAMES_INVALID:${video.nb_read_frames}/${frames}`);
  return {
    width: Number(video.width), height: Number(video.height), frame_rate: video.r_frame_rate,
    exact_frames: Number(video.nb_read_frames || 0), duration_seconds: Number(media.format?.duration || 0), codec: video.codec_name || null,
  };
}

function iconBubble(key, x, y, size = 62, opacity = 0.84) {
  const brand = INVESTOR_BRANDS[key];
  if (!brand) return "";
  const tile = size * 0.76;
  const mark = tile * 0.66;
  return `<g transform="translate(${x} ${y})" opacity="${opacity}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#07090b" fill-opacity="0.62" stroke="#f3f5f7" stroke-opacity="0.13" stroke-width="1"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 8}" fill="${brand.background}" fill-opacity="0.92"/>
    ${investorBrandMark(key, { x: (size - mark) / 2, y: (size - mark) / 2, size: mark })}
  </g>`;
}

function communicationAtmosphereSvg() {
  const icons = [
    ["whatsapp", 96, 230, 68, 0.91], ["instagram", 176, 690, 62, 0.78], ["line", 360, 118, 58, 0.72],
    ["messenger", 1470, 160, 62, 0.76], ["facebook", 1668, 500, 68, 0.86], ["google", 1450, 770, 60, 0.70],
  ];
  const bubbles = icons.map((item) => iconBubble(...item)).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs>${investorBrandDefs()}
      <radialGradient id="soft" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#f2f4f6" stop-opacity="0.09"/><stop offset="0.35" stop-color="#b8bec5" stop-opacity="0.025"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.48" stop-color="#d6a66a" stop-opacity="0.34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <ellipse cx="960" cy="540" rx="460" ry="270" fill="url(#soft)"/>
    <path d="M160 270 C480 170 640 315 790 460" fill="none" stroke="#eef2f5" stroke-opacity="0.08" stroke-width="1.2"/>
    <path d="M1720 540 C1430 480 1280 490 1125 535" fill="none" stroke="#eef2f5" stroke-opacity="0.08" stroke-width="1.2"/>
    <path d="M1500 805 C1300 760 1220 680 1120 610" fill="none" stroke="#d6a66a" stroke-opacity="0.075" stroke-width="1.2"/>
    ${bubbles}
    <rect x="748" y="846" width="424" height="1" fill="url(#edge)"/>
  </svg>`);
}

function studioChannelsSvg() {
  const icons = [
    ["facebook", 50, 40, 58, 0.88], ["instagram", 130, 26, 64, 0.93], ["googleAds", 218, 44, 56, 0.83],
    ["tiktok", 300, 30, 62, 0.88], ["youtube", 388, 44, 56, 0.84], ["linkedin", 468, 34, 60, 0.82],
  ];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="590" height="150"><defs>${investorBrandDefs()}</defs>
    <rect x="12" y="14" width="566" height="116" rx="48" fill="#05070a" fill-opacity="0.50" stroke="#f0f3f6" stroke-opacity="0.10"/>
    <path d="M78 112 C178 136 404 136 512 112" fill="none" stroke="#d6a66a" stroke-opacity="0.13" stroke-width="1.1"/>
    ${icons.map((item) => iconBubble(...item)).join("")}
  </svg>`);
}

function glassFrameSvg(width, height) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.42" stop-color="#aab2bc" stop-opacity="0.025"/><stop offset="1" stop-color="#000" stop-opacity="0.20"/></linearGradient></defs>
    <rect x="10" y="10" width="${width - 20}" height="${height - 20}" rx="24" fill="url(#g)" stroke="#f0f3f6" stroke-opacity="0.16" stroke-width="1.2"/>
    <path d="M34 22 H${width - 94}" stroke="#fff" stroke-opacity="0.18" stroke-width="1"/>
    <circle cx="${width - 40}" cy="28" r="3" fill="#d6a66a" fill-opacity="0.72"/>
  </svg>`);
}

async function rawSvg(directory, name, svg, width, height) {
  return normalizeCreativeStillImage({ svg_buffer: svg, output_directory: directory, name, width, height, fit: "fill" });
}

async function rawImage(directory, name, storagePath, width, height, fit = "contain") {
  return normalizeCreativeStillImage({
    input_buffer: await downloadBuffer(storagePath), output_directory: directory, name, width, height, fit,
    background: { r: 0, g: 0, b: 0, alpha: 0 }, without_enlargement: false,
  });
}

async function normalizeClip(ffmpeg, sourceUrl, frames, output) {
  await run(ffmpeg, [
    "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1",
    "-i", sourceUrl,
    "-map", "0:v:0", "-an",
    "-vf", `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS},eq=contrast=1.055:saturation=0.91:brightness=-0.022,vignette=PI/5.8,tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${frames},setpts=N/(${FPS}*TB)`,
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-frames:v", String(frames), "-movflags", "+faststart", output,
  ], 360000);
}

async function renderCommunication(ffmpeg, ffprobe, directory) {
  const sourceUrls = await Promise.all(COMM_SOURCES.map((item) => signed(item.path)));
  const normalized = [];
  for (let i = 0; i < COMM_SOURCES.length; i += 1) {
    const target = path.join(directory, `comm-${i}.mp4`);
    await normalizeClip(ffmpeg, sourceUrls[i], COMM_SOURCES[i].frames, target);
    normalized.push(target);
  }
  const listPath = path.join(directory, "comm-list.txt");
  await fs.writeFile(listPath, normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  const joined = path.join(directory, "communication-base.mp4");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-map", "0:v:0", "-an", "-c:v", "copy", "-fflags", "+genpts", "-movflags", "+faststart", joined], 180000);

  const [atmosphere, logo] = await Promise.all([
    rawSvg(directory, "communication-atmosphere", communicationAtmosphereSvg(), 1920, 1080),
    rawImage(directory, "canonical-avantiqo-logo", LOGO_PATH, 270, 270, "contain"),
  ]);
  const output = path.join(directory, "communication-professional.mp4");
  const filter = `[1:v]fade=t=in:st=4.70:d=0.65:alpha=1,fade=t=out:st=13.35:d=0.70:alpha=1[a];[2:v]fade=t=in:st=11.80:d=0.65:alpha=1,fade=t=out:st=23.60:d=0.80:alpha=1[l];[0:v][a]overlay=x='8*sin(t*0.22)':y='4*sin(t*0.17)':enable='between(t,4.50,14.10)'[b];[b][l]overlay=x='(W-w)/2+5*sin(t*0.18)':y='(H-h)/2-8+3*sin(t*0.16)':enable='between(t,11.60,24.40)',format=yuv420p[v]`;
  await run(ffmpeg, [
    "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-i", joined,
    ...creativeRawStillInputArgs(atmosphere, { fps: FPS, loop: true }),
    ...creativeRawStillInputArgs(logo, { fps: FPS, loop: true }),
    "-filter_complex", filter, "-map", "[v]", "-an",
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-frames:v", String(COMM_FRAMES), "-movflags", "+faststart", output,
  ], 520000);
  const qc = assertVideo(await probe(ffprobe, output), COMM_FRAMES, "COMMUNICATION_PROFESSIONAL");
  const stored = await upload(COMM_OUTPUT, output, { chapter: "communication_intelligence", exact_frames: COMM_FRAMES, fps: FPS, visual_language: "CINEMATIC_FOOTAGE_FIRST_OPTICAL_GLASS_SECOND", official_channel_marks: true, text_overlay_used: false });
  const preview = path.join(directory, "communication-preview.mp4");
  await run(ffmpeg, ["-y", "-ss", "5.2", "-i", output, "-t", "8", "-map", "0:v:0", "-an", "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", "192", "-movflags", "+faststart", preview], 180000);
  const previewStored = await upload(COMM_PREVIEW, preview, { preview: true, source: COMM_OUTPUT, exact_frames: 192, fps: FPS });
  return { ...stored, qc, preview: previewStored };
}

async function renderStudio(ffmpeg, ffprobe, directory) {
  const baseUrl = await signed(STUDIO_VIDEO_PATH);
  const base = path.join(directory, "studio-base.mp4");
  await run(ffmpeg, [
    "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-stream_loop", "-1", "-i", baseUrl,
    "-map", "0:v:0", "-an",
    "-vf", `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS},eq=contrast=1.06:saturation=0.94:brightness=-0.018,vignette=PI/6,trim=end_frame=${STUDIO_FRAMES},setpts=N/(${FPS}*TB)`,
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-frames:v", String(STUDIO_FRAMES), "-movflags", "+faststart", base,
  ], 420000);

  const [poster, frame, channels, logo] = await Promise.all([
    rawImage(directory, "real-campaign-poster", POSTER_PATH, 410, 560, "contain"),
    rawSvg(directory, "poster-optical-frame", glassFrameSvg(470, 620), 470, 620),
    rawSvg(directory, "studio-channel-marks", studioChannelsSvg(), 590, 150),
    rawImage(directory, "studio-avantiqo-logo", LOGO_PATH, 220, 220, "contain"),
  ]);
  const output = path.join(directory, "studio-professional.mp4");
  const filter = `[1:v]fade=t=in:st=6.70:d=0.60:alpha=1,fade=t=out:st=20.70:d=0.70:alpha=1[p];[2:v]fade=t=in:st=6.45:d=0.55:alpha=1,fade=t=out:st=21.00:d=0.70:alpha=1[f];[3:v]fade=t=in:st=20.20:d=0.70:alpha=1,fade=t=out:st=34.70:d=0.75:alpha=1[c];[4:v]fade=t=in:st=27.40:d=0.70:alpha=1,fade=t=out:st=35.80:d=0.55:alpha=1[l];[0:v][f]overlay=x='118+8*sin(t*0.21)':y='188+5*sin(t*0.18)':enable='between(t,6.20,21.80)'[a];[a][p]overlay=x='148+8*sin(t*0.21)':y='218+5*sin(t*0.18)':enable='between(t,6.50,21.50)'[b];[b][c]overlay=x='W-w-90+6*sin(t*0.19)':y='H-h-80+4*sin(t*0.16)':enable='between(t,19.90,35.50)'[d];[d][l]overlay=x='W-w-112+4*sin(t*0.17)':y='112+3*sin(t*0.15)':enable='between(t,27.10,36.30)',format=yuv420p[v]`;
  await run(ffmpeg, [
    "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-i", base,
    ...creativeRawStillInputArgs(poster, { fps: FPS, loop: true }),
    ...creativeRawStillInputArgs(frame, { fps: FPS, loop: true }),
    ...creativeRawStillInputArgs(channels, { fps: FPS, loop: true }),
    ...creativeRawStillInputArgs(logo, { fps: FPS, loop: true }),
    "-filter_complex", filter, "-map", "[v]", "-an",
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-frames:v", String(STUDIO_FRAMES), "-movflags", "+faststart", output,
  ], 580000);
  const qc = assertVideo(await probe(ffprobe, output), STUDIO_FRAMES, "STUDIO_PROFESSIONAL");
  const stored = await upload(STUDIO_OUTPUT, output, { chapter: "creative_studio_autonomous_marketing", exact_frames: STUDIO_FRAMES, fps: FPS, real_studio_video_used: true, real_campaign_artwork_used: true, official_channel_marks: true, text_overlay_used: false, visual_language: "CINEMATIC_REAL_OUTPUT_SPATIAL_GLASS" });
  const preview = path.join(directory, "studio-preview.mp4");
  await run(ffmpeg, ["-y", "-ss", "7.2", "-i", output, "-t", "8", "-map", "0:v:0", "-an", "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", "192", "-movflags", "+faststart", preview], 180000);
  const previewStored = await upload(STUDIO_PREVIEW, preview, { preview: true, source: STUDIO_OUTPUT, exact_frames: 192, fps: FPS });
  return { ...stored, qc, preview: previewStored };
}

export const AvantiqoInvestorFilmProfessionalChaptersV1 = Object.freeze({
  CONTRACT, COMM_OUTPUT, STUDIO_OUTPUT, COMM_PREVIEW, STUDIO_PREVIEW,
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("PROFESSIONAL_CHAPTER_MEDIA_BINARY_NOT_READY");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-professional-chapters-v1-"));
    try {
      const communication = await renderCommunication(ffmpeg, ffprobe, directory);
      const studio = await renderStudio(ffmpeg, ffprobe, directory);
      return {
        success: true,
        contract: CONTRACT,
        communication,
        studio,
        guarantees: {
          full_screen_cinematic_footage_first: true,
          official_brand_marks_are_vector_paths: true,
          real_studio_video_used: true,
          real_campaign_artwork_used: true,
          text_overlay_used: false,
          server_font_dependency: false,
          screenshot_ui_used: false,
          generated_image_used: false,
          cheap_network_diagram_used: false,
        },
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
});
