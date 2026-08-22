import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandBadge, investorBrandDefs } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const CONTRACT = "AVANTIQO_INVESTOR_SCENE_PREVIEWS_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const SECONDS = 8;
const FRAMES = FPS * SECONDS;
const LOGO_PATH = `${ORG}/unassigned/5a068b01-d435-412d-b288-d138c33a7f98-avantiqo-logo.png`;
const COMMUNICATION_OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/communication-intelligence-preview-v1.mp4`;
const SYNTHETIC_OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/synthetic-intelligence-preview-v1.mp4`;
const X264_PARAMS = "threads=1:lookahead_threads=0:sync-lookahead=0:rc-lookahead=0:bframes=0";

function run(command, args, timeoutMs = 360000) {
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
      if (!settled) { settled = true; reject(new Error("SCENE_PREVIEW_TIMEOUT")); }
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
      if (code !== 0) reject(new Error(err.slice(-16000) || `SCENE_PREVIEW_EXIT_${code}`));
      else resolve(out);
    });
  });
}

async function signed(storagePath, expires = 7200) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expires);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`SCENE_PREVIEW_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function downloadTo(url, localPath) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`SCENE_PREVIEW_DOWNLOAD_FAILED:${response.status}`);
  await fs.writeFile(localPath, Buffer.from(await response.arrayBuffer()));
  return localPath;
}

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: { ...metadata, contract: CONTRACT, preview: true, generated_image_used: false, synthetic_product_ui_used: false },
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length, signed_url: await signed(storagePath, 86400) };
}

function communicationWorldSvg() {
  const nodes = [
    ["whatsapp",210,242,1.04], ["line",430,150,0.91], ["messenger",650,290,1.0],
    ["instagram",890,168,1.08], ["facebook",1125,285,1.0], ["tiktok",1390,158,0.94],
    ["linkedin",1578,300,0.88], ["googleReviews",450,610,0.92], ["googleAds",1415,610,0.92],
  ];
  const centerX = 960;
  const centerY = 520;
  const curves = nodes.map(([,x,y],i) => {
    const c1x = x + (centerX - x) * 0.40;
    const c2x = x + (centerX - x) * 0.72;
    const c1y = y + (centerY - y) * 0.18 + (i % 2 ? 22 : -20);
    const c2y = y + (centerY - y) * 0.78;
    return `<path d="M${x+52} ${y+52} C${c1x} ${c1y},${c2x} ${c2y},${centerX} ${centerY}" fill="none" stroke="#dce2e7" stroke-opacity="0.13" stroke-width="1.2"/>`;
  }).join("");
  const marks = nodes.map(([key,x,y,scale]) => `<g transform="translate(${x} ${y}) scale(${scale})"><circle cx="52" cy="52" r="50" fill="#06080b" fill-opacity="0.62" stroke="#f0f3f6" stroke-opacity="0.12"/><circle cx="52" cy="52" r="43" fill="#ffffff" fill-opacity="0.018"/>${investorBrandBadge(key,{x:9,y:10,width:86,height:84,showStatus:false})}</g>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs>${investorBrandDefs()}<radialGradient id="halo"><stop offset="0" stop-color="#eef2f6" stop-opacity="0.12"/><stop offset="0.45" stop-color="#b7bdc5" stop-opacity="0.035"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><linearGradient id="line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.48" stop-color="#d6a66a" stop-opacity="0.38"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs><ellipse cx="960" cy="520" rx="510" ry="305" fill="url(#halo)"/>${curves}${marks}<g transform="translate(730 438)"><circle cx="230" cy="82" r="86" fill="#07090c" fill-opacity="0.52" stroke="#e9edf1" stroke-opacity="0.17"/><circle cx="230" cy="82" r="64" fill="#ffffff" fill-opacity="0.018"/><circle cx="230" cy="82" r="4" fill="#d6a66a"/><text x="230" y="70" text-anchor="middle" fill="#f3f4f6" font-family="Helvetica Neue,Arial,sans-serif" font-size="16" font-weight="600" letter-spacing="3">ONE BUSINESS</text><text x="230" y="98" text-anchor="middle" fill="#aeb5bd" font-family="Helvetica Neue,Arial,sans-serif" font-size="10" letter-spacing="2.5">CONTEXT</text></g><text x="960" y="808" text-anchor="middle" fill="#e6e9ec" font-family="Helvetica Neue,Arial,sans-serif" font-size="26" font-weight="500" letter-spacing="3.6">EVERY CHANNEL. ONE BUSINESS CONTEXT.</text><text x="960" y="854" text-anchor="middle" fill="#9fa7af" font-family="Helvetica Neue,Arial,sans-serif" font-size="13" letter-spacing="2.1">EMAIL · WEBSITE · REVIEWS · ADS · FORMS · SUPPORT · BOOKINGS · LEADS · AND MORE</text><rect x="735" y="892" width="450" height="1" fill="url(#line)"/></svg>`);
}

function syntheticSignalsSvg() {
  const nodes = [
    [220,218,"TRANSACTION"], [500,145,"CUSTOMER"], [795,245,"INVENTORY"], [1110,145,"PEOPLE"], [1390,248,"OPERATIONS"], [1660,180,"MARKETING"],
    [350,720,"SUPPLY"], [720,800,"CASH"], [1170,735,"SERVICE"], [1538,790,"DECISION"],
  ];
  const lines = nodes.map(([x,y],i) => {
    const a = i * 0.72;
    const nx = 960 + Math.cos(a) * (150 + (i % 3) * 55);
    const ny = 520 + Math.sin(a) * (90 + (i % 2) * 70);
    return `<path d="M${x} ${y} C${(x+nx)/2} ${y},${(x+nx)/2} ${ny},${nx} ${ny}" fill="none" stroke="#e3e8ed" stroke-opacity="0.11" stroke-width="1.15"/>`;
  }).join("");
  const dots = nodes.map(([x,y,label],i) => `<g transform="translate(${x} ${y})"><circle r="${i%3===0?5:3.5}" fill="#eff3f6" fill-opacity="0.72"/><circle r="20" fill="none" stroke="#eff3f6" stroke-opacity="0.07"/><text x="15" y="4" fill="#b9c0c8" fill-opacity="0.45" font-family="Helvetica Neue,Arial,sans-serif" font-size="10" letter-spacing="2">${label}</text></g>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="field"><stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/><stop offset="0.42" stop-color="#bcc4cc" stop-opacity="0.035"/><stop offset="1" stop-color="#000000" stop-opacity="0"/></radialGradient></defs><ellipse cx="960" cy="520" rx="530" ry="315" fill="url(#field)"/>${lines}${dots}</svg>`);
}

function syntheticCoreSvg() {
  const rings = [78,136,210,306].map((r,i) => `<ellipse cx="960" cy="520" rx="${r*1.58}" ry="${r}" fill="none" stroke="${i===0?'#ffffff':'#cbd1d7'}" stroke-opacity="${0.30-i*0.05}" stroke-width="${i===0?1.7:1}"/>`).join("");
  const spokes = Array.from({ length: 20 }, (_,i) => {
    const a = Math.PI * 2 * i / 20;
    const x = 960 + Math.cos(a) * 535;
    const y = 520 + Math.sin(a) * 305;
    return `<path d="M960 520 C${960+Math.cos(a)*170} ${520+Math.sin(a)*95},${960+Math.cos(a)*340} ${520+Math.sin(a)*190},${x} ${y}" fill="none" stroke="#e8ecef" stroke-opacity="0.10"/>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><radialGradient id="core"><stop offset="0" stop-color="#ffffff" stop-opacity="0.20"/><stop offset="0.34" stop-color="#bac1c8" stop-opacity="0.06"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><ellipse cx="960" cy="520" rx="560" ry="330" fill="url(#core)"/>${spokes}${rings}<circle cx="960" cy="520" r="8" fill="#edf1f4"/><circle cx="960" cy="520" r="36" fill="none" stroke="#d6a66a" stroke-opacity="0.20"/></svg>`);
}

function syntheticTitleSvg() {
  const text = "SYNTHETIC INTELLIGENCE";
  const depth = Array.from({length:8},(_,i) => `<text x="960" y="542" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="88" font-weight="600" letter-spacing="7" fill="#242a30" fill-opacity="0.24" transform="translate(${i*1.7} ${i*1.3})">${text}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.26" stop-color="#cfd4da"/><stop offset="0.55" stop-color="#7d858e"/><stop offset="0.78" stop-color="#f2f4f5"/><stop offset="1" stop-color="#777f88"/></linearGradient></defs>${depth}<text x="960" y="542" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="88" font-weight="600" letter-spacing="7" fill="url(#p)">${text}</text><text x="960" y="612" text-anchor="middle" font-family="Helvetica Neue,Helvetica,Arial,sans-serif" font-size="20" font-weight="500" letter-spacing="10" fill="#d9dde1" fill-opacity="0.76">FOR BUSINESS</text><rect x="818" y="655" width="284" height="1" fill="#d6a66a" fill-opacity="0.30"/></svg>`);
}

async function toPng(directory, name, svg) {
  const target = path.join(directory, `${name}.png`);
  await sharp(svg).png().toFile(target);
  return target;
}

async function probe(ffprobe, file) {
  const raw = await run(ffprobe,["-v","error","-count_frames","-show_entries","format=duration:stream=codec_type,width,height,r_frame_rate,nb_read_frames","-of","json",file],120000);
  return JSON.parse(raw || "{}");
}

function assertClip(media, label) {
  const video = (media.streams || []).find((stream) => stream.codec_type === "video");
  const frames = Number(video?.nb_read_frames || 0);
  if (!video || Number(video.width) !== 1920 || Number(video.height) !== 1080) throw new Error(`${label}_DIMENSIONS_INVALID`);
  if (video.r_frame_rate !== "24/1") throw new Error(`${label}_FPS_INVALID:${video.r_frame_rate}`);
  if (frames !== FRAMES) throw new Error(`${label}_FRAMES_INVALID:${frames}`);
  return { frames, dimensions: "1920x1080", fps: video.r_frame_rate, duration_seconds: Number(media.format?.duration || 0) };
}

async function renderCommunication(ffmpeg, ffprobe, directory, logoPath) {
  const world = await toPng(directory,"communication-world",communicationWorldSvg());
  const out = path.join(directory,"communication-intelligence-preview-v1.mp4");
  const filter = `[1:v]format=rgba,fade=t=in:st=0.30:d=0.70:alpha=1,fade=t=out:st=6.35:d=0.65:alpha=1[w];[2:v]format=rgba,scale=365:-1,fade=t=in:st=6.05:d=0.45:alpha=1,fade=t=out:st=7.72:d=0.22:alpha=1[l];[0:v][w]overlay=x='5*sin(t*0.25)':y='3*sin(t*0.19)':enable='between(t,0.20,7.0)'[a];[a][l]overlay=x='(W-w)/2':y='(H-h)/2':enable='between(t,6.0,7.95)',format=yuv420p[v]`;
  await run(ffmpeg,["-y","-threads","1","-filter_threads","1","-filter_complex_threads","1","-f","lavfi","-i",`color=c=#030406:s=1920x1080:r=${FPS}:d=${SECONDS}`,"-loop","1","-framerate",String(FPS),"-i",world,"-loop","1","-framerate",String(FPS),"-i",logoPath,"-f","lavfi","-i",`anullsrc=channel_layout=stereo:sample_rate=48000`,"-filter_complex",filter,"-map","[v]","-map","3:a","-c:v","libx264","-threads","1","-x264-params",X264_PARAMS,"-preset","ultrafast","-crf","15","-pix_fmt","yuv420p","-r",String(FPS),"-frames:v",String(FRAMES),"-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-t",String(SECONDS),"-movflags","+faststart",out],280000);
  return { local: out, qc: assertClip(await probe(ffprobe,out),"COMMUNICATION_PREVIEW") };
}

async function renderSynthetic(ffmpeg, ffprobe, directory, logoPath) {
  const [signals,core,title] = await Promise.all([
    toPng(directory,"synthetic-signals",syntheticSignalsSvg()),
    toPng(directory,"synthetic-core",syntheticCoreSvg()),
    toPng(directory,"synthetic-title",syntheticTitleSvg()),
  ]);
  const out = path.join(directory,"synthetic-intelligence-preview-v1.mp4");
  const filter = `[1:v]format=rgba,fade=t=in:st=0.30:d=0.85:alpha=1,fade=t=out:st=4.55:d=0.75:alpha=1[s];[2:v]format=rgba,fade=t=in:st=1.55:d=0.90:alpha=1,fade=t=out:st=6.45:d=0.60:alpha=1[n];[3:v]format=rgba,fade=t=in:st=4.45:d=0.72:alpha=1,fade=t=out:st=7.05:d=0.42:alpha=1[t];[4:v]format=rgba,scale=330:-1,fade=t=in:st=7.04:d=0.24:alpha=1,fade=t=out:st=7.72:d=0.20:alpha=1[l];[0:v][s]overlay=x='4*sin(t*0.30)':y='3*sin(t*0.21)':enable='between(t,0.20,5.35)'[a];[a][n]overlay=x='2*sin(t*0.20)':y='2*sin(t*0.17)':enable='between(t,1.45,7.00)'[b];[b][t]overlay=0:0:enable='between(t,4.35,7.35)'[c];[c][l]overlay=x='(W-w)/2':y='(H-h)/2':enable='between(t,7.0,7.92)',format=yuv420p[v]`;
  await run(ffmpeg,["-y","-threads","1","-filter_threads","1","-filter_complex_threads","1","-f","lavfi","-i",`color=c=#020304:s=1920x1080:r=${FPS}:d=${SECONDS}`,"-loop","1","-framerate",String(FPS),"-i",signals,"-loop","1","-framerate",String(FPS),"-i",core,"-loop","1","-framerate",String(FPS),"-i",title,"-loop","1","-framerate",String(FPS),"-i",logoPath,"-f","lavfi","-i",`sine=frequency=44:sample_rate=48000:duration=${SECONDS}`,"-f","lavfi","-i",`sine=frequency=98:sample_rate=48000:duration=${SECONDS}`,"-filter_complex",`${filter};[5:a]volume=0.10,afade=t=in:st=0:d=1.4,afade=t=out:st=7.10:d=0.65[lo];[6:a]volume=0.025,afade=t=in:st=2.0:d=1.2,afade=t=out:st=6.90:d=0.80[hi];[lo][hi]amix=inputs=2:duration=longest,alimiter=limit=0.8[a]`,"-map","[v]","-map","[a]","-c:v","libx264","-threads","1","-x264-params",X264_PARAMS,"-preset","ultrafast","-crf","15","-pix_fmt","yuv420p","-r",String(FPS),"-frames:v",String(FRAMES),"-c:a","aac","-b:a","192k","-ar","48000","-ac","2","-t",String(SECONDS),"-movflags","+faststart",out],280000);
  return { local: out, qc: assertClip(await probe(ffprobe,out),"SYNTHETIC_PREVIEW") };
}

export const AvantiqoInvestorScenePreviewRuntimeV1 = Object.freeze({
  CONTRACT,
  COMMUNICATION_OUTPUT,
  SYNTHETIC_OUTPUT,
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    const ffprobe = resolveCreativeFfprobePath();
    if (!ffmpeg || !ffprobe) throw new Error("SCENE_PREVIEW_MEDIA_BINARY_NOT_READY");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(),"avantiqo-scene-previews-"));
    try {
      const logoPath = path.join(directory,"avantiqo-logo.png");
      await downloadTo(await signed(LOGO_PATH),logoPath);
      const communication = await renderCommunication(ffmpeg,ffprobe,directory,logoPath);
      const synthetic = await renderSynthetic(ffmpeg,ffprobe,directory,logoPath);
      const [communicationStored,syntheticStored] = await Promise.all([
        upload(COMMUNICATION_OUTPUT,communication.local,{scene:"COMMUNICATION_INTELLIGENCE",exact_frames:FRAMES,fps:FPS,neutral_graphite_environment:true,real_channel_marks:true,and_more_ecosystem:true,clean_avantiqo_logo_anchor:true}),
        upload(SYNTHETIC_OUTPUT,synthetic.local,{scene:"SYNTHETIC_INTELLIGENCE",exact_frames:FRAMES,fps:FPS,deterministic_typography:true,platinum_titanium_language:true,clean_avantiqo_logo_transition:true}),
      ]);
      return { success:true, contract:CONTRACT, communication:{...communicationStored,qc:communication.qc}, synthetic_intelligence:{...syntheticStored,qc:synthetic.qc}, guarantees:{image_generation_used:false,screenshots_used:false,synthetic_product_ui_used:false,real_avantiqo_logo_used:true,official_channel_marks_used:true} };
    } finally {
      await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
    }
  },
});
