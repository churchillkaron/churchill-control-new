import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandBadge, investorBrandDefs } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_V9_SPATIAL_INTELLIGENCE_V3";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const BUCKET = "creative-assets";
const FPS = 24;

const COMMUNICATION_PATH = `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`;
const STUDIO_PATH = `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`;
const STUDIO_POSTER_PATH = `${ORG}/campaigns/9f9cdf6f-5a6d-4d3a-8df0-b091ea266ecc/f9a260d4-b83b-4022-8844-9a1aace6c06c-03-churchill.png`;
const STUDIO_VIDEO_PATH = `${ORG}/1460b8b2-ef56-4548-8c58-ded3c0d1bed7/e5e0935c-10b7-4206-9141-dd96c4e742d0/e5e0935c-10b7-4206-9141-dd96c4e742d0.mp4`;

function run(command, args, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("V9_SPATIAL_INTELLIGENCE_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
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
  if (!data?.signedUrl) throw new Error(`V9_SPATIAL_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4", upsert: true, cacheControl: "3600",
    metadata: { ...metadata, contract: CONTRACT, checksum, spatial_intelligence: true, generated_ui_used: false, real_creative_assets_used: true },
  });
  if (error) throw error;
  return { bytes: bytes.length, checksum };
}

function glassSvg({ width, height, label, sublabel = "" }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5f7fa" stop-opacity=".16"/><stop offset=".36" stop-color="#9ba3ad" stop-opacity=".055"/><stop offset="1" stop-color="#05070a" stop-opacity=".26"/></linearGradient><linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".56"/><stop offset=".52" stop-color="#bcc4ce" stop-opacity=".16"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".32"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="12" result="blur"/><feOffset dy="11" result="off"/><feColorMatrix in="off" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .48 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#shadow)"><rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="28" fill="url(#glass)" stroke="url(#edge)" stroke-width="1.4"/><path d="M44 31 H${Math.max(44, width - 132)}" stroke="#ffffff" stroke-opacity=".24" stroke-width="1"/><circle cx="${width - 55}" cy="48" r="4" fill="#d6a66a" fill-opacity=".8"/><text x="48" y="62" fill="#f1f2f3" font-family="Arial,Helvetica,sans-serif" font-size="13" font-weight="700" letter-spacing="1.8">${label}</text>${sublabel ? `<text x="48" y="84" fill="#aab0b7" font-family="Arial,Helvetica,sans-serif" font-size="10.5" letter-spacing=".8">${sublabel}</text>` : ""}</g></svg>`);
}

function communicationNodesSvg() {
  const nodes = [["googleReviews",90,118,"CUSTOMER SIGNAL"],["whatsapp",90,228,"CONVERSATION"],["line",90,338,"CONVERSATION"],["messenger",678,118,"CONVERSATION"],["instagram",678,228,"SOCIAL INTENT"],["facebook",678,338,"SOCIAL INTENT"]];
  const connections = nodes.map(([,x,y]) => { const sx = x < 480 ? x + 164 : x; const sy = y + 30; return `<path d="M${sx} ${sy} C${x < 480 ? 330 : 630} ${sy}, ${x < 480 ? 390 : 570} 270, 480 270" fill="none" stroke="#dfe4ea" stroke-opacity=".22" stroke-width="1.2"/>`; }).join("");
  const badges = nodes.map(([key,x,y,signal]) => `<g transform="translate(${x} ${y})"><rect width="164" height="60" rx="18" fill="#07090c" fill-opacity=".58" stroke="#eef2f6" stroke-opacity=".18"/>${investorBrandBadge(key,{x:12,y:9,width:140,height:42})}<text x="82" y="56" text-anchor="middle" fill="#9fa6ae" font-family="Arial" font-size="7.5" letter-spacing="1">${signal}</text></g>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs>${investorBrandDefs()}</defs>${connections}${badges}<g transform="translate(370 205)"><rect width="220" height="130" rx="30" fill="#080a0e" fill-opacity=".5" stroke="#eef3f7" stroke-opacity=".24"/><rect x="12" y="12" width="196" height="106" rx="22" fill="#ffffff" fill-opacity=".025"/><text x="110" y="57" text-anchor="middle" fill="#f3f4f5" font-family="Arial" font-size="13" font-weight="700" letter-spacing="2">AVANTIQO</text><text x="110" y="80" text-anchor="middle" fill="#b7bdc5" font-family="Arial" font-size="9" letter-spacing="1.5">COMMUNICATION INTELLIGENCE</text><circle cx="110" cy="101" r="3.5" fill="#d6a66a"/></g></svg>`);
}

function marketingNodesSvg() {
  const keys = ["facebook","instagram","googleAds","tiktok","youtube","linkedin"];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="170" viewBox="0 0 960 170"><defs>${investorBrandDefs()}</defs>${keys.map((key,index) => { const x = 42 + index * 150; return `<g transform="translate(${x} 52)"><rect width="126" height="58" rx="18" fill="#07090c" fill-opacity=".58" stroke="#eef2f6" stroke-opacity=".16"/>${investorBrandBadge(key,{x:6,y:8,width:114,height:42,showStatus:true})}</g>`; }).join("")}<path d="M86 132 H874" stroke="#dfe4ea" stroke-opacity=".18"/><circle cx="480" cy="132" r="4" fill="#d6a66a"/><text x="480" y="157" text-anchor="middle" fill="#aeb4bc" font-family="Arial" font-size="9" letter-spacing="1.4">CREATE  ·  PUBLISH  ·  LEARN  ·  ACT</text></svg>`);
}

async function png(directory, name, svg) { const target = path.join(directory, `${name}.png`); await sharp(svg).png().toFile(target); return target; }

async function correctCommunication(ffmpeg, directory) {
  const sourceUrl = await signed(COMMUNICATION_PATH);
  const nodes = await png(directory, "communication-spatial-nodes", communicationNodesSvg());
  const output = path.join(directory, "communication-spatial-v3.mp4");
  await run(ffmpeg, ["-y","-i",sourceUrl,"-loop","1","-framerate",String(FPS),"-i",nodes,"-filter_complex",`[1:v]format=rgba,scale=1500:-1,fade=t=in:st=4.8:d=0.7:alpha=1,fade=t=out:st=29.7:d=0.8:alpha=1[n];[0:v][n]overlay=x='210+8*sin(t*.45)':y='118+4*sin(t*.31)':enable='between(t,4.6,30.5)':shortest=0,format=yuv420p[v]`,`-map`,`[v]`,`-map`,`0:a?`,`-c:v`,`libx264`,`-preset`,`veryfast`,`-crf`,`17`,`-r`,String(FPS),`-c:a`,`copy`,`-frames:v`,`911`,output]);
  const stored = await upload(COMMUNICATION_PATH, output, { organization_id: ORG, exact_frames: 911, fps: FPS, corrected_chapter: "COMMUNICATION_INTELLIGENCE", treatment: "SPATIAL_AUTHENTIC_CHANNEL_NODES" });
  return { path: COMMUNICATION_PATH, ...stored };
}

async function correctStudio(ffmpeg, directory) {
  const [sourceUrl,posterUrl,videoUrl] = await Promise.all([signed(STUDIO_PATH),signed(STUDIO_POSTER_PATH),signed(STUDIO_VIDEO_PATH)]);
  const posterGlass = await png(directory,"poster-glass",glassSvg({width:520,height:700,label:"CAMPAIGN DESIGN",sublabel:"REAL CREATIVE STUDIO OUTPUT"}));
  const videoGlass = await png(directory,"video-glass",glassSvg({width:820,height:520,label:"CINEMATIC VIDEO",sublabel:"REAL CREATIVE STUDIO OUTPUT"}));
  const channels = await png(directory,"marketing-spatial-nodes",marketingNodesSvg());
  const output = path.join(directory,"studio-spatial-v3.mp4");
  await run(ffmpeg,["-y","-i",sourceUrl,"-loop","1","-framerate",String(FPS),"-i",posterUrl,"-stream_loop","-1","-i",videoUrl,"-loop","1","-framerate",String(FPS),"-i",posterGlass,"-loop","1","-framerate",String(FPS),"-i",videoGlass,"-loop","1","-framerate",String(FPS),"-i",channels,"-filter_complex",`[1:v]scale=382:510:force_original_aspect_ratio=decrease,pad=382:510:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,fade=t=in:st=7.5:d=0.7:alpha=1,fade=t=out:st=20.8:d=0.7:alpha=1[p];[2:v]scale=650:366:force_original_aspect_ratio=increase,crop=650:366,format=rgba,fade=t=in:st=10.2:d=0.8:alpha=1,fade=t=out:st=27.2:d=0.8:alpha=1[m];[3:v]scale=430:578,format=rgba,fade=t=in:st=7.2:d=0.6:alpha=1,fade=t=out:st=21:d=0.7:alpha=1[pg];[4:v]scale=720:457,format=rgba,fade=t=in:st=9.9:d=0.7:alpha=1,fade=t=out:st=27.5:d=0.8:alpha=1[vg];[5:v]scale=1500:266,format=rgba,fade=t=in:st=21.2:d=0.8:alpha=1,fade=t=out:st=34.5:d=0.8:alpha=1[ch];[0:v][pg]overlay=x='120-14*sin(t*.34)':y='80+6*sin(t*.28)':enable='between(t,7,21.8)'[a];[a][p]overlay=x='144-14*sin(t*.34)':y='138+6*sin(t*.28)':enable='between(t,7.3,21.5)'[b];[b][vg]overlay=x='1030+18*sin(t*.29)':y='145+7*sin(t*.23)':enable='between(t,9.7,28.3)'[c];[c][m]overlay=x='1065+18*sin(t*.29)':y='220+7*sin(t*.23)':enable='between(t,10,28)'[d];[d][ch]overlay=x=210:y='780+4*sin(t*.3)':enable='between(t,21,35.3)':shortest=0,format=yuv420p[v]`,`-map`,`[v]`,`-map`,`0:a?`,`-c:v`,`libx264`,`-preset`,`veryfast`,`-crf`,`17`,`-r`,String(FPS),`-c:a`,`copy`,`-frames:v`,`881`,output],600000);
  const stored = await upload(STUDIO_PATH, output, { organization_id: ORG, exact_frames: 881, fps: FPS, corrected_chapter: "STUDIO_MARKETING", treatment: "REAL_OUTPUT_SPATIAL_GLASS", creative_assets: [STUDIO_POSTER_PATH,STUDIO_VIDEO_PATH] });
  return { path: STUDIO_PATH, ...stored };
}

async function probe(ffprobe, url) { const raw = await run(ffprobe,["-v","error","-count_frames","-show_entries","stream=codec_type,width,height,r_frame_rate,nb_read_frames","-of","json",url],120000); return JSON.parse(raw || "{}"); }

export const AvantiqoInvestorFilmSpatialIntelligenceRuntimeV3 = Object.freeze({
  CONTRACT,
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("V9_SPATIAL_INTELLIGENCE_MEDIA_BINARY_NOT_READY");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-v9-spatial-v3-"));
    try {
      const communication = await correctCommunication(ffmpeg,directory);
      const studio = await correctStudio(ffmpeg,directory);
      const [cp,sp] = await Promise.all([probe(ffprobe,await signed(COMMUNICATION_PATH)),probe(ffprobe,await signed(STUDIO_PATH))]);
      const cv = (cp.streams || []).find((stream) => stream.codec_type === "video");
      const sv = (sp.streams || []).find((stream) => stream.codec_type === "video");
      if (Number(cv?.nb_read_frames || 0) !== 911) throw new Error(`V9_SPATIAL_COMM_FRAMES_INVALID:${cv?.nb_read_frames}`);
      if (Number(sv?.nb_read_frames || 0) !== 881) throw new Error(`V9_SPATIAL_STUDIO_FRAMES_INVALID:${sv?.nb_read_frames}`);
      return { success: true, contract: CONTRACT, communication: { ...communication, frames: Number(cv.nb_read_frames), dimensions: `${cv.width}x${cv.height}`, fps: cv.r_frame_rate }, studio: { ...studio, frames: Number(sv.nb_read_frames), dimensions: `${sv.width}x${sv.height}`, fps: sv.r_frame_rate }, guarantees: { screenshots_used: false, synthetic_product_ui_used: false, real_studio_video_used: true, real_studio_campaign_design_used: true, authentic_channel_marks_used: true, spatial_glass_treatment: true, scene_timed_visual_reinforcement: true } };
    } finally { await fs.rm(directory,{recursive:true,force:true}).catch(() => {}); }
  },
});
