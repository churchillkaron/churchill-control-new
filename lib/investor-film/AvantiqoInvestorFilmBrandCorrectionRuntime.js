import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandBadge, investorBrandDefs } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_V9_AUTHENTIC_BRAND_CORRECTION_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";
const FPS = 24;

const COMMUNICATION_PATH = `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`;
const STUDIO_PATH = `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`;

function run(command, args, timeoutMs = 420000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("V9_BRAND_CORRECTION_MEDIA_TIMEOUT"));
      }
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
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(out);
    });
  });
}

async function signed(storagePath, expires = 7200) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`V9_BRAND_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: { ...metadata, contract: CONTRACT, checksum, authentic_brand_marks: true },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

function svgBase(body) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs>${investorBrandDefs()}</defs>${body}</svg>`);
}

function communicationOverlaySvg() {
  const channelKeys = ["googleReviews", "whatsapp", "line", "email", "facebook", "instagram", "messenger", "website"];
  const channelBadges = channelKeys.map((key, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    const x = 78 + col * 205;
    const y = 215 + row * 58;
    return `<rect x="${x - 3}" y="${y - 3}" width="196" height="48" rx="14" fill="#08090b" fill-opacity=".97"/>${investorBrandBadge(key, { x, y, width: 190, height: 42 })}`;
  }).join("");

  const live = [
    ["OpenAI", "Reasoning", true],
    ["Flux", "Image", true],
    ["Runway", "Video", true],
    ["Google AI", "Model routing", true],
    ["Meta", "Social execution", true],
    ["Veo", "Video ecosystem", false],
    ["Seedance", "Video ecosystem", false],
    ["ElevenLabs", "Voice ecosystem", false],
  ];
  const serviceChips = live.map((item, index) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    const x = 62 + col * 218;
    const y = 220 + row * 58;
    const status = item[2] ? "LIVE" : "ECOSYSTEM";
    const statusColor = item[2] ? "#D6A66A" : "#77736B";
    return `<g transform="translate(${x} ${y})"><rect width="202" height="44" rx="12" fill="#08090b" fill-opacity=".98" stroke="#fff" stroke-opacity=".09"/><circle cx="17" cy="22" r="5.5" fill="${statusColor}"/><text x="32" y="19" fill="#EEEDE8" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700">${item[0]}</text><text x="32" y="33" fill="#85827B" font-family="Arial,Helvetica,sans-serif" font-size="8.5">${item[1]}</text><text x="188" y="26" text-anchor="end" fill="${statusColor}" font-family="Arial,Helvetica,sans-serif" font-size="7.5" font-weight="700" letter-spacing=".7">${status}</text></g>`;
  }).join("");

  return svgBase(`${channelBadges}${serviceChips}`);
}

function studioOverlaySvg() {
  const keys = ["facebook", "instagram", "googleAds", "tiktok", "youtube", "linkedin"];
  const labels = ["Facebook", "Instagram", "Google Ads", "TikTok", "YouTube", "LinkedIn"];
  const badges = keys.map((key, index) => {
    const x = 78 + index * 136;
    const y = 236;
    return `<rect x="${x - 3}" y="${y - 3}" width="126" height="54" rx="16" fill="#08090b" fill-opacity=".98"/>${investorBrandBadge(key, { x, y, width: 120, height: 48, label: labels[index], showStatus: true })}`;
  }).join("");
  return svgBase(badges);
}

async function rgbaPanel(directory, name, svg) {
  const target = path.join(directory, `${name}.rgba`);
  const bytes = await sharp(svg).ensureAlpha().raw().toBuffer();
  await fs.writeFile(target, bytes);
  return target;
}

async function correctCommunication(ffmpeg, directory) {
  const sourceUrl = await signed(COMMUNICATION_PATH);
  const overlayRaw = await rgbaPanel(directory, "communication-brand-overlay", communicationOverlaySvg());
  const output = path.join(directory, "communication-corrected.mp4");
  const communicationStart = 120 / FPS;
  const communicationEnd = (120 + 168) / FPS;
  const aiStart = (120 + 168 + 156) / FPS;
  const aiEnd = (120 + 168 + 156 + 144) / FPS;
  await run(ffmpeg, [
    "-y", "-i", sourceUrl,
    "-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "960x540", "-framerate", String(FPS), "-i", overlayRaw,
    "-filter_complex",
    `[1:v]format=rgba,scale=1560:878[ov];[0:v][ov]overlay=x=180:y=101:enable='between(t,${communicationStart},${communicationEnd})+between(t,${aiStart},${aiEnd})':shortest=0,format=yuv420p[v]`,
    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", String(FPS), "-c:a", "copy", "-t", String(911 / FPS), output,
  ], 420000);
  const stored = await upload(COMMUNICATION_PATH, output, { organization_id: ORG, exact_frames: 911, fps: FPS, corrected_chapter: "COMMUNICATION_INTELLIGENCE" });
  return { path: COMMUNICATION_PATH, ...stored };
}

async function correctStudio(ffmpeg, directory) {
  const sourceUrl = await signed(STUDIO_PATH);
  const overlayRaw = await rgbaPanel(directory, "studio-brand-overlay", studioOverlaySvg());
  const output = path.join(directory, "studio-corrected.mp4");
  const launchStart = (118 + 174 + 156 + 176) / FPS;
  const launchEnd = (118 + 174 + 156 + 176 + 132) / FPS;
  await run(ffmpeg, [
    "-y", "-i", sourceUrl,
    "-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "960x540", "-framerate", String(FPS), "-i", overlayRaw,
    "-filter_complex", `[1:v]format=rgba,scale=1560:878[ov];[0:v][ov]overlay=x=180:y=101:enable='between(t,${launchStart},${launchEnd})':shortest=0,format=yuv420p[v]`,
    "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-r", String(FPS), "-c:a", "copy", "-t", String(881 / FPS), output,
  ], 420000);
  const stored = await upload(STUDIO_PATH, output, { organization_id: ORG, exact_frames: 881, fps: FPS, corrected_chapter: "STUDIO_MARKETING" });
  return { path: STUDIO_PATH, ...stored };
}

async function probe(ffprobe, url) {
  const raw = await run(ffprobe, ["-v", "error", "-count_frames", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,nb_read_frames", "-of", "json", url], 120000);
  return JSON.parse(raw || "{}");
}

export const AvantiqoInvestorFilmBrandCorrectionRuntime = Object.freeze({
  CONTRACT,
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("V9_BRAND_CORRECTION_MEDIA_BINARY_NOT_READY");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v9-brand-correction-"));
    try {
      const communication = await correctCommunication(ffmpeg, directory);
      const studio = await correctStudio(ffmpeg, directory);
      const [communicationProbe, studioProbe] = await Promise.all([probe(ffprobe, await signed(COMMUNICATION_PATH)), probe(ffprobe, await signed(STUDIO_PATH))]);
      const communicationVideo = (communicationProbe.streams || []).find((s) => s.codec_type === "video");
      const studioVideo = (studioProbe.streams || []).find((s) => s.codec_type === "video");
      if (Number(communicationVideo?.nb_read_frames || 0) !== 911) throw new Error(`V9_BRAND_COMM_FRAMES_INVALID:${communicationVideo?.nb_read_frames}`);
      if (Number(studioVideo?.nb_read_frames || 0) !== 881) throw new Error(`V9_BRAND_STUDIO_FRAMES_INVALID:${studioVideo?.nb_read_frames}`);
      return {
        success: true,
        contract: CONTRACT,
        communication: { ...communication, frames: Number(communicationVideo.nb_read_frames), dimensions: `${communicationVideo.width}x${communicationVideo.height}`, fps: communicationVideo.r_frame_rate },
        studio: { ...studio, frames: Number(studioVideo.nb_read_frames), dimensions: `${studioVideo.width}x${studioVideo.height}`, fps: studioVideo.r_frame_rate },
        corrections: {
          authentic_channel_marks: ["Facebook", "Instagram", "Messenger", "WhatsApp", "LINE", "Google Reviews", "Google Ads", "TikTok", "YouTube", "LinkedIn"],
          neutral_owned_channel_marks: ["Email", "Website"],
          ai_service_status_truthful: true,
          placeholder_social_symbols_removed: true,
        },
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
});
