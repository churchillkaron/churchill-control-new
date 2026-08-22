import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const CONTRACT = "AVANTIQO_INVESTOR_V9_DETERMINISTIC_WINDOW_REPAIR_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const COMM_PATH = `${ORG}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`;
const STUDIO_PATH = `${ORG}/avantiqo-investor-film-20260821/studio-marketing-cinema-v1-881f.mp4`;
const UI_COMM = `${ORG}/avantiqo-investor-film-20260820/ui/customer_communications.png`;
const UI_MARKETING = `${ORG}/avantiqo-investor-film-20260820/ui/autonomous_marketing.png`;
const UI_CONNECTED = `${ORG}/avantiqo-investor-film-20260820/ui/integrations_connected_services.png`;
const QC_ROOT = `${ORG}/${PROJECT}/spatial-master-v9/qc`;
const THREAD_ARGS = ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];

const REPAIRS = Object.freeze({
  communication: Object.freeze({
    source_path: COMM_PATH,
    output_path: COMM_PATH,
    total_frames: 911,
    start_frame: 120,
    repair_frames: 168,
    qc_path: `${QC_ROOT}/communication.jpg`,
    qc_times: [1.5, 4.2, 5.15, 5.75, 6.5, 7.55, 8.55, 9.55, 10.55, 11.4, 12.25, 16, 22, 28, 34, 37.2],
  }),
  studio_marketing: Object.freeze({
    source_path: STUDIO_PATH,
    output_path: STUDIO_PATH,
    total_frames: 881,
    start_frame: 292,
    repair_frames: 156,
    qc_path: `${QC_ROOT}/studio_marketing.jpg`,
    qc_times: [1.5, 4.5, 8, 11.5, 12.25, 13.25, 14.5, 15.75, 17, 18.25, 19.25, 23, 27, 30, 33.5, 36],
  }),
});

function run(command, args, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        OMP_NUM_THREADS: "1",
        OPENBLAS_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
      },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("INVESTOR_V9_WINDOW_REPAIR_MEDIA_TIMEOUT"));
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

async function storageExists(storagePath) {
  const directory = storagePath.slice(0, storagePath.lastIndexOf("/"));
  const name = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: name, limit: 10 });
  if (error) throw error;
  return (data || []).some((entry) => entry.name === name);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`INVESTOR_V9_WINDOW_REPAIR_DOWNLOAD_EMPTY:${storagePath}`);
  const bytes = Buffer.from(await data.arrayBuffer());
  await fs.writeFile(localPath, bytes);
  return bytes;
}

async function uploadVideo(storagePath, localPath, metadata = {}) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      creative_project_id: PROJECT,
      deterministic_repair: true,
      generated_replacement_footage_used: false,
      authentic_ui_used: true,
      checksum,
      ...metadata,
    },
  });
  if (error) throw error;
  return { checksum, bytes: bytes.length };
}

async function uploadJpeg(storagePath, bytes, metadata = {}) {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "image/jpeg",
    upsert: true,
    cacheControl: "60",
    metadata: { contract: CONTRACT, organization_id: ORG, creative_project_id: PROJECT, ...metadata },
  });
  if (error) throw error;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function basePlateSvg({ title, kicker, footer, dual = false }) {
  const screenFrames = dual
    ? `<rect x="118" y="150" width="1090" height="640" rx="30" fill="#050609" stroke="#D6A66A" stroke-opacity=".58" stroke-width="2"/>
       <rect x="1250" y="150" width="550" height="640" rx="30" fill="#050609" stroke="#D6A66A" stroke-opacity=".40" stroke-width="2"/>`
    : `<rect x="238" y="136" width="1444" height="720" rx="34" fill="#050609" stroke="#D6A66A" stroke-opacity=".58" stroke-width="2"/>`;
  const stands = dual
    ? `<path d="M665 790 L665 875 L560 905 L770 905 L770 790Z" fill="#15171b" stroke="#D6A66A" stroke-opacity=".16"/>
       <path d="M1525 790 L1525 875 L1455 900 L1595 900 L1595 790Z" fill="#15171b" stroke="#D6A66A" stroke-opacity=".14"/>`
    : `<path d="M890 856 L890 918 L758 948 L1162 948 L1030 918 L1030 856Z" fill="#17191d" stroke="#D6A66A" stroke-opacity=".18"/>`;
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#050607"/><stop offset="0.52" stop-color="#0d0f12"/><stop offset="1" stop-color="#17130e"/></linearGradient>
        <radialGradient id="warm" cx="79%" cy="18%" r="70%"><stop offset="0" stop-color="#D6A66A" stop-opacity=".19"/><stop offset="1" stop-color="#D6A66A" stop-opacity="0"/></radialGradient>
        <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#222429"/><stop offset="1" stop-color="#090a0c"/></linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#bg)"/>
      <rect width="1920" height="1080" fill="url(#warm)"/>
      <ellipse cx="960" cy="946" rx="720" ry="88" fill="#D6A66A" fill-opacity=".055"/>
      <path d="M0 920 L1920 850 L1920 1080 L0 1080Z" fill="url(#desk)"/>
      <path d="M0 920 L1920 850" stroke="#D6A66A" stroke-opacity=".13"/>
      ${screenFrames}
      ${stands}
      <text x="96" y="78" fill="#D6A66A" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700" letter-spacing="3">${esc(kicker)}</text>
      <text x="96" y="116" fill="#F7F4EC" font-family="Arial,Helvetica,sans-serif" font-size="28" font-weight="650">${esc(title)}</text>
      <text x="96" y="1032" fill="#AAA69D" font-family="Arial,Helvetica,sans-serif" font-size="13">${esc(footer)}</text>
      <text x="1825" y="1032" text-anchor="end" fill="#D6A66A" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700">AVANTIQO</text>
    </svg>`);
}

async function createCommunicationPlate(uiBytes, target) {
  const screen = await sharp(uiBytes)
    .resize(1360, 636, { fit: "contain", background: { r: 5, g: 6, b: 9, alpha: 1 } })
    .png()
    .toBuffer();
  const bezel = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect x="258" y="154" width="1404" height="682" rx="24" fill="none" stroke="#ffffff" stroke-opacity=".12"/>
    <rect x="291" y="817" width="1338" height="1" fill="#D6A66A" fill-opacity=".24"/>
    <text x="310" y="806" fill="#D6A66A" font-family="Arial" font-size="11" font-weight="700">AUTHENTIC AVANTIQO CUSTOMER COMMUNICATIONS</text>
    <text x="1610" y="806" text-anchor="end" fill="#8F8B83" font-family="Arial" font-size="10">REVIEWS · WHATSAPP · LINE · EMAIL · SOCIAL · WEB</text>
  </svg>`);
  await sharp(basePlateSvg({
    kicker: "AVANTIQO · COMMUNICATION INTELLIGENCE",
    title: "Every message enters one governed business context.",
    footer: "Real product UI · physically supported display · deterministic brand treatment",
  }))
    .composite([
      { input: screen, left: 280, top: 172 },
      { input: bezel, left: 0, top: 0 },
    ])
    .png()
    .toFile(target);
}

async function createStudioPlate(marketingBytes, connectedBytes, target) {
  const primary = await sharp(marketingBytes)
    .resize(1038, 578, { fit: "contain", background: { r: 5, g: 6, b: 9, alpha: 1 } })
    .png()
    .toBuffer();
  const secondary = await sharp(connectedBytes)
    .resize(498, 578, { fit: "contain", background: { r: 5, g: 6, b: 9, alpha: 1 } })
    .png()
    .toBuffer();
  const bezel = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect x="138" y="170" width="1050" height="600" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".12"/>
    <rect x="1270" y="170" width="510" height="600" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".10"/>
    <text x="160" y="804" fill="#D6A66A" font-family="Arial" font-size="11" font-weight="700">AUTHENTIC AUTONOMOUS MARKETING</text>
    <text x="1292" y="804" fill="#D6A66A" font-family="Arial" font-size="11" font-weight="700">CONNECTED EXECUTION</text>
    <g transform="translate(205 842)">
      <text x="0" y="0" fill="#F4F0E7" font-family="Arial" font-size="13" font-weight="700">HERO FILM</text><text x="150" y="0" fill="#9E9A92" font-family="Arial" font-size="13">SHORTS</text><text x="255" y="0" fill="#9E9A92" font-family="Arial" font-size="13">SOCIAL</text><text x="360" y="0" fill="#9E9A92" font-family="Arial" font-size="13">STILLS</text><text x="455" y="0" fill="#9E9A92" font-family="Arial" font-size="13">LANDING</text><text x="575" y="0" fill="#9E9A92" font-family="Arial" font-size="13">EMAIL</text><text x="660" y="0" fill="#9E9A92" font-family="Arial" font-size="13">VOICE</text><text x="740" y="0" fill="#9E9A92" font-family="Arial" font-size="13">MUSIC</text>
    </g>
  </svg>`);
  await sharp(basePlateSvg({
    kicker: "AVANTIQO · CREATIVE STUDIO",
    title: "One campaign universe. Real product proof. Controlled execution.",
    footer: "Strategy → production → channel execution → learning · no generated text or unsupported devices",
    dual: true,
  }))
    .composite([
      { input: primary, left: 144, top: 181 },
      { input: secondary, left: 1276, top: 181 },
      { input: bezel, left: 0, top: 0 },
    ])
    .png()
    .toFile(target);
}

async function plateVideo(ffmpeg, platePath, frames, target) {
  const duration = frames / FPS;
  await run(ffmpeg, [
    "-y", "-loop", "1", "-i", platePath,
    "-vf", `scale=1960:1103,zoompan=z='min(zoom+0.00022,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS},fade=t=in:st=0:d=0.22,fade=t=out:st=${Math.max(0.3, duration - 0.28)}:d=0.26,format=yuv420p`,
    "-an", "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-crf", "16",
    "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(frames), "-t", String(duration), target,
  ], 150000);
}

async function spliceWindow(ffmpeg, original, replacement, repair, target) {
  const endFrame = repair.start_frame + repair.repair_frames;
  const filter = [
    `[0:v]trim=start_frame=0:end_frame=${repair.start_frame},setpts=PTS-STARTPTS[a]`,
    `[1:v]trim=start_frame=0:end_frame=${repair.repair_frames},setpts=PTS-STARTPTS[b]`,
    `[0:v]trim=start_frame=${endFrame}:end_frame=${repair.total_frames},setpts=PTS-STARTPTS[c]`,
    `[a][b][c]concat=n=3:v=1:a=0,fps=${FPS},format=yuv420p[v]`,
  ].join(";");
  await run(ffmpeg, [
    "-y", ...THREAD_ARGS, "-i", original, "-i", replacement,
    "-filter_complex", filter, "-map", "[v]", "-an",
    "-c:v", "libx264", "-threads", "1", "-preset", "veryfast", "-crf", "17",
    "-pix_fmt", "yuv420p", "-r", String(FPS), "-frames:v", String(repair.total_frames), "-movflags", "+faststart", target,
  ], 300000);
}

async function probeVideo(ffprobe, localPath) {
  const raw = await run(ffprobe, [
    "-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,r_frame_rate,nb_read_frames:format=duration", "-of", "json", localPath,
  ], 90000);
  const parsed = JSON.parse(raw || "{}");
  const video = parsed?.streams?.[0] || {};
  return {
    width: Number(video.width || 0), height: Number(video.height || 0), frame_rate: video.r_frame_rate || null,
    frames: Number(video.nb_read_frames || 0), duration_seconds: Number(parsed?.format?.duration || 0), codec: video.codec_name || null,
  };
}

function qcLabelSvg(key, seconds) {
  const label = `${key}  ${seconds.toFixed(2)}s`;
  return Buffer.from(`<svg width="320" height="180" xmlns="http://www.w3.org/2000/svg"><rect x="7" y="149" width="306" height="24" rx="6" fill="#020205" fill-opacity=".84"/><text x="14" y="166" fill="#F1DCAC" font-family="Arial" font-size="11" font-weight="700">${esc(label)}</text></svg>`);
}

async function createQcSheet(ffmpeg, localPath, key, times, directory) {
  const frames = [];
  for (let index = 0; index < times.length; index += 1) {
    const seconds = times[index];
    const raw = path.join(directory, `${key}-qc-${index}.jpg`);
    await run(ffmpeg, ["-y", "-threads", "1", "-ss", String(seconds), "-i", localPath, "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=increase,crop=320:180", "-q:v", "2", raw], 30000);
    const framed = await sharp(raw).composite([{ input: qcLabelSvg(key, seconds), top: 0, left: 0 }]).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    frames.push(framed);
  }
  const cols = 4;
  const rows = Math.ceil(frames.length / cols);
  const gap = 4;
  const width = cols * 320 + (cols - 1) * gap;
  const height = rows * 180 + (rows - 1) * gap;
  return sharp({ create: { width, height, channels: 3, background: { r: 2, g: 2, b: 5 } } })
    .composite(frames.map((input, index) => ({ input, left: (index % cols) * 324, top: Math.floor(index / cols) * 184 })))
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

async function renderRepairs() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("INVESTOR_V9_WINDOW_REPAIR_MEDIA_BINARY_NOT_READY");

  const required = [COMM_PATH, STUDIO_PATH, UI_COMM, UI_MARKETING, UI_CONNECTED];
  for (const storagePath of required) if (!(await storageExists(storagePath))) throw new Error(`INVESTOR_V9_WINDOW_REPAIR_SOURCE_MISSING:${storagePath}`);

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-v9-window-repair-"));
  try {
    const commOriginal = path.join(directory, "communication-original.mp4");
    const studioOriginal = path.join(directory, "studio-original.mp4");
    const commUiPath = path.join(directory, "customer-communications.png");
    const marketingUiPath = path.join(directory, "autonomous-marketing.png");
    const connectedUiPath = path.join(directory, "connected-services.png");
    const commUiBytes = await download(UI_COMM, commUiPath);
    const marketingUiBytes = await download(UI_MARKETING, marketingUiPath);
    const connectedUiBytes = await download(UI_CONNECTED, connectedUiPath);
    await Promise.all([download(COMM_PATH, commOriginal), download(STUDIO_PATH, studioOriginal)]);

    const commPlate = path.join(directory, "communication-plate.png");
    const studioPlate = path.join(directory, "studio-plate.png");
    await createCommunicationPlate(commUiBytes, commPlate);
    await createStudioPlate(marketingUiBytes, connectedUiBytes, studioPlate);

    const commReplacement = path.join(directory, "communication-replacement.mp4");
    const studioReplacement = path.join(directory, "studio-replacement.mp4");
    await plateVideo(ffmpeg, commPlate, REPAIRS.communication.repair_frames, commReplacement);
    await plateVideo(ffmpeg, studioPlate, REPAIRS.studio_marketing.repair_frames, studioReplacement);

    const commFinal = path.join(directory, "communication-final.mp4");
    const studioFinal = path.join(directory, "studio-final.mp4");
    await spliceWindow(ffmpeg, commOriginal, commReplacement, REPAIRS.communication, commFinal);
    await spliceWindow(ffmpeg, studioOriginal, studioReplacement, REPAIRS.studio_marketing, studioFinal);

    const [commProbe, studioProbe] = await Promise.all([probeVideo(ffprobe, commFinal), probeVideo(ffprobe, studioFinal)]);
    for (const [key, probe, expected] of [["communication", commProbe, 911], ["studio_marketing", studioProbe, 881]]) {
      if (probe.width !== 1920 || probe.height !== 1080) throw new Error(`INVESTOR_V9_WINDOW_REPAIR_DIMENSIONS_INVALID:${key}:${probe.width}x${probe.height}`);
      if (probe.frame_rate !== "24/1") throw new Error(`INVESTOR_V9_WINDOW_REPAIR_FPS_INVALID:${key}:${probe.frame_rate}`);
      if (probe.frames !== expected) throw new Error(`INVESTOR_V9_WINDOW_REPAIR_FRAME_COUNT_INVALID:${key}:${probe.frames}/${expected}`);
    }

    const commStored = await uploadVideo(COMM_PATH, commFinal, {
      repaired_window_start_frame: REPAIRS.communication.start_frame,
      repaired_window_frames: REPAIRS.communication.repair_frames,
      repair_reason: "UNSUPPORTED_PHYSICAL_DEVICE_BLOCKER",
      authentic_ui_sources: [UI_COMM],
    });
    const studioStored = await uploadVideo(STUDIO_PATH, studioFinal, {
      repaired_window_start_frame: REPAIRS.studio_marketing.start_frame,
      repaired_window_frames: REPAIRS.studio_marketing.repair_frames,
      repair_reason: "HUMAN_GLASS_INTERSECTION_BLOCKER",
      authentic_ui_sources: [UI_MARKETING, UI_CONNECTED],
    });

    const [commQc, studioQc] = await Promise.all([
      createQcSheet(ffmpeg, commFinal, "communication", REPAIRS.communication.qc_times, directory),
      createQcSheet(ffmpeg, studioFinal, "studio_marketing", REPAIRS.studio_marketing.qc_times, directory),
    ]);
    await Promise.all([
      uploadJpeg(REPAIRS.communication.qc_path, commQc, { repaired: true, source_path: COMM_PATH }),
      uploadJpeg(REPAIRS.studio_marketing.qc_path, studioQc, { repaired: true, source_path: STUDIO_PATH }),
    ]);

    return {
      success: true,
      contract: CONTRACT,
      repaired: true,
      generated_replacement_footage_used: false,
      authentic_ui_used: true,
      repairs: {
        communication: {
          storage_path: COMM_PATH,
          start_frame: REPAIRS.communication.start_frame,
          end_frame_exclusive: REPAIRS.communication.start_frame + REPAIRS.communication.repair_frames,
          start_seconds: REPAIRS.communication.start_frame / FPS,
          end_seconds: (REPAIRS.communication.start_frame + REPAIRS.communication.repair_frames) / FPS,
          technical_qc: commProbe,
          checksum: commStored.checksum,
          bytes: commStored.bytes,
          qc_path: REPAIRS.communication.qc_path,
        },
        studio_marketing: {
          storage_path: STUDIO_PATH,
          start_frame: REPAIRS.studio_marketing.start_frame,
          end_frame_exclusive: REPAIRS.studio_marketing.start_frame + REPAIRS.studio_marketing.repair_frames,
          start_seconds: REPAIRS.studio_marketing.start_frame / FPS,
          end_seconds: (REPAIRS.studio_marketing.start_frame + REPAIRS.studio_marketing.repair_frames) / FPS,
          technical_qc: studioProbe,
          checksum: studioStored.checksum,
          bytes: studioStored.bytes,
          qc_path: REPAIRS.studio_marketing.qc_path,
        },
      },
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorFilmV9WindowRepairRuntimeV1 = Object.freeze({
  CONTRACT,
  ORG,
  PROJECT,
  BUCKET,
  REPAIRS,
  async status() {
    return {
      contract: CONTRACT,
      communication_ready: await storageExists(COMM_PATH),
      studio_marketing_ready: await storageExists(STUDIO_PATH),
      authentic_ui_ready: {
        customer_communications: await storageExists(UI_COMM),
        autonomous_marketing: await storageExists(UI_MARKETING),
        integrations_connected_services: await storageExists(UI_CONNECTED),
      },
    };
  },
  async render() { return renderRepairs(); },
});
