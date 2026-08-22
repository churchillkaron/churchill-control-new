import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandDefs, investorBrandMark } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_FLOATING_CHANNEL_LOGO_PREVIEW_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";
const FPS = 24;
const FRAMES = 168;
const DURATION = 7;
const SOURCE = `${ORG}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`;
const OUTPUT = `${ORG}/avantiqo-investor-film-20260822/previews/floating-channel-logos-luxury-v1-7s.mp4`;
const THREADS = ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];

const CHANNELS = Object.freeze([
  { key: "googleReviews", x: 260, y: 360, enter: 0.55, phase: 0.2 },
  { key: "whatsapp", x: 500, y: 235, enter: 0.95, phase: 1.1 },
  { key: "line", x: 785, y: 185, enter: 1.35, phase: 2.0 },
  { key: "messenger", x: 1110, y: 215, enter: 1.75, phase: 2.8 },
  { key: "instagram", x: 1390, y: 350, enter: 2.15, phase: 3.6 },
  { key: "facebook", x: 1210, y: 690, enter: 2.55, phase: 4.4 },
]);

function run(command, args, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const out = [];
    const err = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("LOGO_PREVIEW_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code !== 0) reject(new Error(Buffer.concat(err).toString("utf8").slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(Buffer.concat(out).toString("utf8"));
    });
  });
}

async function signed(storagePath, seconds = 7200) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`LOGO_PREVIEW_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(OUTPUT, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      contract: CONTRACT,
      exact_frames: FRAMES,
      fps: FPS,
      preview: true,
      floating_channel_marks: true,
      badge_boxes: false,
      screenshot_panels: false,
      image_generation_used: false,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

function iconSvg(key) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><defs>${investorBrandDefs()}<radialGradient id="halo"><stop offset="0" stop-color="#ffffff" stop-opacity=".12"/><stop offset=".62" stop-color="#ffffff" stop-opacity=".025"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs><circle cx="75" cy="75" r="70" fill="url(#halo)"/><circle cx="75" cy="75" r="51" fill="#050608" fill-opacity=".22" stroke="#edf1f4" stroke-opacity=".09"/><circle cx="75" cy="75" r="43" fill="#fff" fill-opacity=".018"/>${investorBrandMark(key, { x: 48, y: 48, size: 54 })}<path d="M39 113 Q75 128 111 113" fill="none" stroke="#d6a66a" stroke-opacity=".18" stroke-width="1"/></svg>`);
}

function networkSvg() {
  const lines = CHANNELS.map(({ x, y }, index) => {
    const cx = 935;
    const cy = 520;
    const bendX = (x + cx) / 2;
    const bendY = cy + (index % 2 === 0 ? -65 : 70);
    return `<path d="M${x + 75} ${y + 75} C${bendX} ${bendY},${bendX} ${cy},${cx} ${cy}" fill="none" stroke="#e5e9ed" stroke-opacity=".10" stroke-width="1.2"/>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="h"><stop offset="0" stop-color="#eef2f5" stop-opacity=".10"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="edge"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".5" stop-color="#fff" stop-opacity=".42"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".24"/></linearGradient></defs><ellipse cx="935" cy="520" rx="530" ry="300" fill="url(#h)"/>${lines}<g><polygon points="800,445 1085,455 1070,595 785,585" fill="#ffffff" fill-opacity=".035" stroke="url(#edge)" stroke-width="1"/><path d="M825 468 L1020 475" stroke="#fff" stroke-opacity=".18"/><text x="935" y="515" text-anchor="middle" fill="#f4f5f6" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="500" letter-spacing="2">AVANTIQO</text><text x="935" y="548" text-anchor="middle" fill="#b2b8bf" font-family="Arial,Helvetica,sans-serif" font-size="10" letter-spacing="3">ONE COMMUNICATION CONTEXT</text><circle cx="935" cy="573" r="4" fill="#d6a66a" fill-opacity=".85"/></g><text x="108" y="105" fill="#cbd0d5" fill-opacity=".72" font-family="Arial,Helvetica,sans-serif" font-size="12" letter-spacing="4">COMMUNICATION INTELLIGENCE</text><text x="108" y="162" fill="#f4f5f6" font-family="Arial,Helvetica,sans-serif" font-size="42">Every signal enters one business context.</text><rect x="108" y="200" width="510" height="1" fill="url(#edge)"/></svg>`);
}

async function rawAsset(directory, name, svg, width, height) {
  const target = path.join(directory, `${name}.rgba`);
  await sharp(svg).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toFile(target);
  return { path: target, size: `${width}x${height}` };
}

function rawInput(asset) {
  return ["-stream_loop", "-1", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", asset.size, "-framerate", String(FPS), "-i", asset.path];
}

export const AvantiqoInvestorFilmLogoShotPreviewV1 = Object.freeze({
  CONTRACT,
  OUTPUT,
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("LOGO_PREVIEW_MEDIA_BINARY_NOT_READY");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-logo-shot-v1-"));
    try {
      const sourceUrl = await signed(SOURCE);
      const network = await rawAsset(directory, "network", networkSvg(), 1920, 1080);
      const icons = [];
      for (const channel of CHANNELS) icons.push(await rawAsset(directory, channel.key, iconSvg(channel.key), 150, 150));
      const output = path.join(directory, "floating-channel-logos.mp4");
      const args = ["-y", ...THREADS, "-stream_loop", "-1", "-i", sourceUrl, ...rawInput(network)];
      icons.forEach((asset) => args.push(...rawInput(asset)));

      const filters = [];
      filters.push(`[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},setsar=1,eq=contrast=1.08:saturation=.72:brightness=-.05[base]`);
      filters.push(`[1:v]fade=t=in:st=0.15:d=0.65:alpha=1,fade=t=out:st=6.45:d=0.45:alpha=1[net]`);
      filters.push(`[base][net]overlay=x='2*sin(t*0.16)':y='2*sin(t*0.13)':shortest=0[v0]`);

      CHANNELS.forEach((channel, index) => {
        const input = index + 2;
        const out = `i${index}`;
        const next = `v${index + 1}`;
        const exit = 6.35 - index * 0.03;
        filters.push(`[${input}:v]fade=t=in:st=${channel.enter}:d=0.42:alpha=1,fade=t=out:st=${exit.toFixed(2)}:d=0.38:alpha=1[${out}]`);
        const xExpr = `${channel.x}+8*sin(t*0.55+${channel.phase})`;
        const yExpr = `${channel.y}+11*sin(t*0.41+${channel.phase})`;
        filters.push(`[v${index}][${out}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t,${channel.enter},6.75)':shortest=0[${next}]`);
      });
      filters.push(`[v${CHANNELS.length}]fade=t=in:st=0:d=0.18,fade=t=out:st=6.72:d=0.28,format=yuv420p[v]`);

      args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-r", String(FPS), "-frames:v", String(FRAMES), "-t", String(DURATION), "-movflags", "+faststart", output);
      await run(ffmpeg, args, 240000);
      const raw = await run(ffprobe, ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", output], 90000);
      const media = JSON.parse(raw || "{}");
      const video = media.streams?.[0];
      const frames = Number(video?.nb_read_frames || 0);
      if (Number(video?.width) !== 1920 || Number(video?.height) !== 1080) throw new Error(`LOGO_PREVIEW_DIMENSIONS_INVALID:${video?.width}x${video?.height}`);
      if (video?.r_frame_rate !== "24/1") throw new Error(`LOGO_PREVIEW_FPS_INVALID:${video?.r_frame_rate}`);
      if (frames !== FRAMES) throw new Error(`LOGO_PREVIEW_FRAMES_INVALID:${frames}/${FRAMES}`);
      const stored = await upload(output);
      return { success: true, contract: CONTRACT, storage_path: OUTPUT, ...stored, technical_qc: { width: 1920, height: 1080, fps: "24/1", frames, duration_seconds: Number(media.format?.duration || 0) }, signed_url: await signed(OUTPUT, 86400), visual: { floating_real_channel_marks: true, independent_motion: true, central_optical_glass_node: true, logo_boxes: false, screenshot_ui: false } };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
});
