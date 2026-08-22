import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { normalizeCreativeStillImage, creativeRawStillInputArgs } from "@/lib/creative/media/runtime/CreativeStillImageInputRuntime";
import { investorBrandDefs, investorBrandMark, INVESTOR_BRANDS } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FILM_AVANTIQO_FIRST_CHAPTERS_V2";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const COMM_FRAMES = 911;
const STUDIO_FRAMES = 881;
const PREVIEW_FRAMES = 192;
const REVIEW_ROOT = `${ORG}/${PROJECT}/scene-previews-20260822/avantiqo-first-v2`;
const COMM_OUTPUT = `${REVIEW_ROOT}/communication-avantiqo-first-v2-911f.mp4`;
const STUDIO_OUTPUT = `${REVIEW_ROOT}/studio-avantiqo-first-v2-881f.mp4`;
const COMM_PREVIEW = `${REVIEW_ROOT}/communication-avantiqo-first-v2-preview.mp4`;
const STUDIO_PREVIEW = `${REVIEW_ROOT}/studio-avantiqo-first-v2-preview.mp4`;

const UI_ROOT = `${ORG}/avantiqo-investor-film-20260820/ui`;
const UI_COMM = `${UI_ROOT}/customer_communications.png`;
const UI_CONNECTED = `${UI_ROOT}/integrations_connected_services.png`;
const UI_MARKETING = `${UI_ROOT}/autonomous_marketing.png`;
const LOGO_PATH = `${ORG}/unassigned/5a068b01-d435-412d-b288-d138c33a7f98-avantiqo-logo.png`;

// Approved Avantiqo manager footage gives the communication scene a real human/business environment.
const COMM_BACKGROUND = `${ORG}/unassigned/61b4afe1-93ae-4e1e-a92f-60dff5d629be-avantiqo-investor-manager-ee25292e-4fd3-4249-81cb-3ab526fd2048.mp4`;
// Non-Churchill luxury/property footage is used only as Creative Studio campaign proof in the background.
const STUDIO_CAMPAIGN_VIDEO = `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`;

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
      if (!settled) { settled = true; reject(new Error("AVANTIQO_FIRST_CHAPTER_MEDIA_TIMEOUT")); }
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
  if (!data?.signedUrl) throw new Error(`SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function downloadBuffer(storagePath) {
  const response = await fetch(await signed(storagePath), { cache: "no-store" });
  if (!response.ok) throw new Error(`DOWNLOAD_FAILED:${response.status}:${storagePath}`);
  return Buffer.from(await response.arrayBuffer());
}

async function upload(storagePath, localPath, metadata = {}) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "900",
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      creative_project_id: PROJECT,
      review_only: true,
      churchill_assets_used: false,
      authentic_avantiqo_ui_used: true,
      synthetic_product_ui_used: false,
      generated_image_used: false,
      checksum,
      ...metadata,
    },
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length, checksum, signed_url: await signed(storagePath, 3600) };
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
  if (Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`${label}_DIMENSIONS_INVALID`);
  if ((video.r_frame_rate || "") !== "24/1") throw new Error(`${label}_FPS_INVALID:${video.r_frame_rate}`);
  if (Number(video.nb_read_frames || 0) !== frames) throw new Error(`${label}_FRAMES_INVALID:${video.nb_read_frames}/${frames}`);
  return {
    width: Number(video.width), height: Number(video.height), frame_rate: video.r_frame_rate,
    exact_frames: Number(video.nb_read_frames || 0), duration_seconds: Number(media.format?.duration || 0), codec: video.codec_name || null,
  };
}

async function rawImage(directory, name, storagePath, width, height, fit = "contain") {
  return normalizeCreativeStillImage({
    input_buffer: await downloadBuffer(storagePath),
    output_directory: directory,
    name,
    width,
    height,
    fit,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    without_enlargement: false,
  });
}

async function rawSvg(directory, name, svg, width, height) {
  return normalizeCreativeStillImage({ svg_buffer: svg, output_directory: directory, name, width, height, fit: "fill" });
}

function glassSvg(width, height, radius = 28) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/><stop offset="0.36" stop-color="#bfc5cc" stop-opacity="0.028"/><stop offset="0.76" stop-color="#080a0d" stop-opacity="0.14"/><stop offset="1" stop-color="#000000" stop-opacity="0.22"/></linearGradient>
      <radialGradient id="r" cx="24%" cy="12%" r="90%"><stop offset="0" stop-color="#D6A66A" stop-opacity="0.14"/><stop offset="0.5" stop-color="#D6A66A" stop-opacity="0.018"/><stop offset="1" stop-color="#D6A66A" stop-opacity="0"/></radialGradient>
    </defs>
    <rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="${radius}" fill="#030507" fill-opacity="0.34" stroke="#F4F5F6" stroke-opacity="0.17" stroke-width="1.2"/>
    <rect x="9" y="9" width="${width - 18}" height="${height - 18}" rx="${Math.max(4, radius - 1)}" fill="url(#g)"/>
    <rect x="9" y="9" width="${width - 18}" height="${height - 18}" rx="${Math.max(4, radius - 1)}" fill="url(#r)"/>
    <path d="M32 21 H${Math.max(42, width - 130)}" stroke="#FFFFFF" stroke-opacity="0.22" stroke-width="1"/>
    <path d="M${Math.max(40, width - 150)} ${height - 22} H${width - 34}" stroke="#D6A66A" stroke-opacity="0.36" stroke-width="1"/>
  </svg>`);
}

function brandNode(key, x, y, size = 58, opacity = 0.92) {
  const brand = INVESTOR_BRANDS[key];
  if (!brand) return "";
  const mark = size * 0.58;
  return `<g transform="translate(${x} ${y})" opacity="${opacity}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="#06080a" fill-opacity="0.76" stroke="#f3f5f7" stroke-opacity="0.16"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 9}" fill="${brand.background}" fill-opacity="0.96"/>
    ${investorBrandMark(key, { x: (size - mark) / 2, y: (size - mark) / 2, size: mark })}
  </g>`;
}

function communicationBrandsSvg() {
  const nodes = [
    ["whatsapp", 22, 26], ["line", 104, 10], ["messenger", 186, 26],
    ["facebook", 268, 10], ["instagram", 350, 26], ["google", 432, 10],
  ];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="94"><defs>${investorBrandDefs()}</defs>
    <path d="M44 74 C144 90 376 90 474 74" fill="none" stroke="#D6A66A" stroke-opacity="0.18"/>
    ${nodes.map(([key, x, y]) => brandNode(key, x, y, 60, 0.94)).join("")}
  </svg>`);
}

function marketingBrandsSvg() {
  const nodes = [
    ["instagram", 18, 20], ["tiktok", 94, 4], ["youtube", 170, 20],
    ["facebook", 246, 4], ["googleads", 322, 20], ["linkedin", 398, 4],
  ];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="478" height="92"><defs>${investorBrandDefs()}</defs>
    <path d="M40 72 C126 88 350 88 438 72" fill="none" stroke="#D6A66A" stroke-opacity="0.18"/>
    ${nodes.map(([key, x, y]) => brandNode(key, x, y, 58, 0.93)).join("")}
  </svg>`);
}

function lightSweepSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.48" stop-color="#ffffff" stop-opacity="0.035"/><stop offset="0.52" stop-color="#D6A66A" stop-opacity="0.06"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>
    <path d="M-240 980 L640 0 H1050 L120 1080Z" fill="url(#s)"/>
  </svg>`);
}

async function renderCommunication(ffmpeg, ffprobe, directory) {
  const bg = await signed(COMM_BACKGROUND);
  const uiComm = await rawImage(directory, "comm-ui", UI_COMM, 1040, 585, "contain");
  const uiConnected = await rawImage(directory, "connected-ui", UI_CONNECTED, 560, 315, "contain");
  const logo = await rawImage(directory, "logo", LOGO_PATH, 220, 100, "contain");
  const brands = await rawSvg(directory, "comm-brands", communicationBrandsSvg(), 520, 94);
  const glassMain = await rawSvg(directory, "comm-glass-main", glassSvg(1110, 655, 30), 1110, 655);
  const glassSecondary = await rawSvg(directory, "comm-glass-secondary", glassSvg(620, 375, 24), 620, 375);
  const sweep = await rawSvg(directory, "comm-sweep", lightSweepSvg(), 1920, 1080);
  const out = path.join(directory, "communication-v2.mp4");

  const args = ["-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-i", bg];
  for (const asset of [uiComm, uiConnected, logo, brands, glassMain, glassSecondary, sweep]) {
    args.push(...creativeRawStillInputArgs(asset, { fps: FPS, loop: true }));
  }

  const filter = [
    `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS},eq=contrast=1.07:saturation=0.72:brightness=-0.055,vignette=PI/5.6,tpad=stop_mode=clone:stop_duration=40,trim=end_frame=${COMM_FRAMES},setpts=N/(${FPS}*TB)[bg]`,
    `[7:v]format=rgba,colorchannelmixer=aa=0.72[sweep]`,
    `[bg][sweep]overlay=0:0:format=auto[base]`,
    `[5:v]format=rgba,rotate=-0.010:c=none:ow=rotw(iw):oh=roth(ih)[g1]`,
    `[base][g1]overlay=x='360+5*sin(t*0.34)':y='205+4*cos(t*0.31)':format=auto[b1]`,
    `[1:v]format=rgba,colorchannelmixer=aa=0.94,rotate=-0.010:c=none:ow=rotw(iw):oh=roth(ih)[u1]`,
    `[b1][u1]overlay=x='395+5*sin(t*0.34)':y='240+4*cos(t*0.31)':format=auto[b2]`,
    `[6:v]format=rgba,rotate=0.014:c=none:ow=rotw(iw):oh=roth(ih)[g2]`,
    `[b2][g2]overlay=x='1190+4*cos(t*0.30)':y='565+3*sin(t*0.36)':format=auto[b3]`,
    `[2:v]format=rgba,colorchannelmixer=aa=0.88,rotate=0.014:c=none:ow=rotw(iw):oh=roth(ih)[u2]`,
    `[b3][u2]overlay=x='1220+4*cos(t*0.30)':y='595+3*sin(t*0.36)':format=auto[b4]`,
    `[4:v]format=rgba,fade=t=in:st=1.1:d=0.6:alpha=1,fade=t=out:st=36.5:d=0.8:alpha=1[brands]`,
    `[b4][brands]overlay=x=1220:y=110:format=auto[b5]`,
    `[3:v]format=rgba,colorchannelmixer=aa=0.90[logo]`,
    `[b5][logo]overlay=x=86:y=62:format=auto,format=yuv420p[outv]`,
  ].join(";");

  args.push("-filter_complex", filter, "-map", "[outv]", "-an", "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(COMM_FRAMES), "-movflags", "+faststart", out);
  await run(ffmpeg, args, 720000);
  const qc = assertVideo(await probe(ffprobe, out), COMM_FRAMES, "COMMUNICATION_V2");
  return { local: out, qc };
}

async function renderStudio(ffmpeg, ffprobe, directory) {
  const campaign = await signed(STUDIO_CAMPAIGN_VIDEO);
  const uiMarketing = await rawImage(directory, "marketing-ui", UI_MARKETING, 820, 461, "contain");
  const logo = await rawImage(directory, "studio-logo", LOGO_PATH, 210, 96, "contain");
  const brands = await rawSvg(directory, "marketing-brands", marketingBrandsSvg(), 478, 92);
  const glassUi = await rawSvg(directory, "studio-glass-ui", glassSvg(880, 521, 28), 880, 521);
  const glassWide = await rawSvg(directory, "studio-glass-wide", glassSvg(760, 470, 28), 760, 470);
  const glassVert = await rawSvg(directory, "studio-glass-vert", glassSvg(330, 610, 24), 330, 610);
  const glassPoster = await rawSvg(directory, "studio-glass-poster", glassSvg(310, 470, 24), 310, 470);
  const sweep = await rawSvg(directory, "studio-sweep", lightSweepSvg(), 1920, 1080);
  const out = path.join(directory, "studio-v2.mp4");

  const args = ["-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-stream_loop", "-1", "-i", campaign];
  for (const asset of [uiMarketing, logo, brands, glassUi, glassWide, glassVert, glassPoster, sweep]) {
    args.push(...creativeRawStillInputArgs(asset, { fps: FPS, loop: true }));
  }

  const filter = [
    `[0:v]fps=${FPS},split=4[bgsrc][wide0][vert0][poster0]`,
    `[bgsrc]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=contrast=1.08:saturation=0.58:brightness=-0.10,gblur=sigma=12,vignette=PI/5.2,tpad=stop_mode=clone:stop_duration=40,trim=end_frame=${STUDIO_FRAMES},setpts=N/(${FPS}*TB)[bg]`,
    `[wide0]scale=700:394:force_original_aspect_ratio=increase,crop=700:394,eq=contrast=1.05:saturation=0.90:brightness=-0.015,tpad=stop_mode=clone:stop_duration=40,trim=end_frame=${STUDIO_FRAMES},setpts=N/(${FPS}*TB)[wide]`,
    `[vert0]crop=ih*9/16:ih,scale=280:498,eq=contrast=1.05:saturation=0.92:brightness=-0.01,tpad=stop_mode=clone:stop_duration=40,trim=end_frame=${STUDIO_FRAMES},setpts=N/(${FPS}*TB)[vert]`,
    `[poster0]trim=start=1.25:end=1.30,setpts=PTS-STARTPTS,scale=270:430:force_original_aspect_ratio=increase,crop=270:430,tpad=stop_mode=clone:stop_duration=40,trim=end_frame=${STUDIO_FRAMES},setpts=N/(${FPS}*TB)[poster]`,
    `[8:v]format=rgba,colorchannelmixer=aa=0.66[sweep]`,
    `[bg][sweep]overlay=0:0:format=auto[base]`,
    `[4:v]format=rgba,rotate=-0.012:c=none:ow=rotw(iw):oh=roth(ih)[gui]`,
    `[base][gui]overlay=x='350+5*sin(t*0.27)':y='225+4*cos(t*0.31)':format=auto[b1]`,
    `[1:v]format=rgba,colorchannelmixer=aa=0.91,rotate=-0.012:c=none:ow=rotw(iw):oh=roth(ih)[ui]`,
    `[b1][ui]overlay=x='380+5*sin(t*0.27)':y='255+4*cos(t*0.31)':format=auto[b2]`,
    `[5:v]format=rgba,rotate=0.018:c=none:ow=rotw(iw):oh=roth(ih)[gw]`,
    `[b2][gw]overlay=x='1090+4*cos(t*0.24)':y='170+3*sin(t*0.29)':format=auto[b3]`,
    `[b3][wide]overlay=x='1120+4*cos(t*0.24)':y='207+3*sin(t*0.29)':format=auto[b4]`,
    `[6:v]format=rgba,rotate=-0.020:c=none:ow=rotw(iw):oh=roth(ih)[gv]`,
    `[b4][gv]overlay=x='70+4*sin(t*0.26)':y='390+3*cos(t*0.30)':format=auto[b5]`,
    `[b5][vert]overlay=x='95+4*sin(t*0.26)':y='442+3*cos(t*0.30)':format=auto[b6]`,
    `[7:v]format=rgba,rotate=0.016:c=none:ow=rotw(iw):oh=roth(ih)[gp]`,
    `[b6][gp]overlay=x='1515+4*cos(t*0.23)':y='545+3*sin(t*0.28)':format=auto[b7]`,
    `[b7][poster]overlay=x='1535+4*cos(t*0.23)':y='565+3*sin(t*0.28)':format=auto[b8]`,
    `[3:v]format=rgba,fade=t=in:st=1.4:d=0.7:alpha=1,fade=t=out:st=35.2:d=0.9:alpha=1[brands]`,
    `[b8][brands]overlay=x=1050:y=885:format=auto[b9]`,
    `[2:v]format=rgba,colorchannelmixer=aa=0.90[logo]`,
    `[b9][logo]overlay=x=84:y=65:format=auto,format=yuv420p[outv]`,
  ].join(";");

  args.push("-filter_complex", filter, "-map", "[outv]", "-an", "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(STUDIO_FRAMES), "-movflags", "+faststart", out);
  await run(ffmpeg, args, 720000);
  const qc = assertVideo(await probe(ffprobe, out), STUDIO_FRAMES, "STUDIO_V2");
  return { local: out, qc };
}

async function preview(ffmpeg, source, target, frames = PREVIEW_FRAMES) {
  await run(ffmpeg, [
    "-y", "-threads", "1", "-i", source, "-map", "0:v:0", "-an",
    "-c:v", "libx264", "-threads", "1", "-x264-params", X264_PARAMS, "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-frames:v", String(frames), "-movflags", "+faststart", target,
  ], 180000);
}

export const AvantiqoInvestorFilmAvantiqoFirstChaptersV2 = Object.freeze({
  CONTRACT,
  outputs: Object.freeze({ communication: COMM_OUTPUT, studio: STUDIO_OUTPUT, communication_preview: COMM_PREVIEW, studio_preview: STUDIO_PREVIEW }),
  async render() {
    const ffmpeg = await resolveCreativeFfmpegPath();
    const ffprobe = await resolveCreativeFfprobePath();
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-first-v2-"));
    try {
      const communication = await renderCommunication(ffmpeg, ffprobe, directory);
      const studio = await renderStudio(ffmpeg, ffprobe, directory);
      const commPreviewLocal = path.join(directory, "communication-preview.mp4");
      const studioPreviewLocal = path.join(directory, "studio-preview.mp4");
      await preview(ffmpeg, communication.local, commPreviewLocal);
      await preview(ffmpeg, studio.local, studioPreviewLocal);
      const [commUpload, studioUpload, commPreviewUpload, studioPreviewUpload] = await Promise.all([
        upload(COMM_OUTPUT, communication.local, { scene: "communication", exact_frames: COMM_FRAMES, background: "approved_avantiqo_manager", product_ui: "customer_communications+integrations_connected_services" }),
        upload(STUDIO_OUTPUT, studio.local, { scene: "studio_marketing", exact_frames: STUDIO_FRAMES, background_campaign: "non_churchill_luxury_hotel", product_ui: "autonomous_marketing" }),
        upload(COMM_PREVIEW, commPreviewLocal, { scene: "communication_preview", exact_frames: PREVIEW_FRAMES }),
        upload(STUDIO_PREVIEW, studioPreviewLocal, { scene: "studio_preview", exact_frames: PREVIEW_FRAMES }),
      ]);
      return {
        success: true,
        contract: CONTRACT,
        review_only: true,
        canonical_master_untouched: true,
        communication: { ...commUpload, qc: communication.qc },
        studio: { ...studioUpload, qc: studio.qc },
        previews: { communication: commPreviewUpload, studio: studioPreviewUpload },
        guarantees: {
          churchill_assets_used: false,
          avantiqo_is_visual_hero: true,
          authentic_avantiqo_ui_only: true,
          background_campaign: "NON_CHURCHILL_LUXURY_HOTEL",
          social_logos_are_execution_nodes_not_decoration: true,
          generated_images: false,
          synthetic_product_ui: false,
          canonical_v9_overwrite: false,
        },
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => null);
    }
  },
});
