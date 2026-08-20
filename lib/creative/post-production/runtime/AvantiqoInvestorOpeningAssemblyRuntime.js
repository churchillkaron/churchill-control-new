import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260820/opening`;
const OUTPUT_PATH = `${OUTPUT_DIR}/avantiqo-investor-opening-v1-approved-identity.mp4`;

const APPROVED_LOGO_PATH = `${ORGANIZATION_ID}/unassigned/df1cdd49-68e2-4a77-956e-6c9565c0074d-google-veo-6c9upygjkui2.mp4`;
const APPROVED_FOUNDER_MOTION_PATH = `${ORGANIZATION_ID}/unassigned/eaa7edd6-7a62-4ca2-9eac-dfb14059e649-gemini-founder-rgro0za2hzes.mp4`;
const LOCKED_CEDAR_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`;

const APPROVED_FOUNDER_REFERENCE_ASSET_ID = "3e1b5197-5279-4713-93ed-0b0defc9581a";
const APPROVED_FOUNDER_REFERENCE_SHA256 = "40309c0610076b2107e4f2ca50c265187c097756a7bfdecb9e7909e6ca5c795a";
const APPROVED_FOUNDER_MOTION_SHA256 = "78b995566a564e7801f0a240a522ae5a02163680006b857bb091572182b121a1";
const REJECTED_LEGACY_FOUNDER_ASSET_ID = "052e10e2-432e-4cf9-82bd-65cb5bb7441a";

const FRAME_RATE = 24;
const WIDTH = 1280;
const HEIGHT = 720;
const LOGO_SECONDS = 8;

// Deterministic timing baseline from the locked 229.5 second Cedar master.
// These are the first six locked script beats from the timing pass.
const OPENING_BEATS = Object.freeze([
  {
    id: "origin-01",
    start: 0,
    end: 5.063,
    duration: 5.063,
    visual: "FOUNDER",
    text: "I didn’t build Avantiqo because I wanted to create another software company.",
  },
  {
    id: "origin-02",
    start: 5.063,
    end: 11.391,
    duration: 6.328,
    visual: "FOUNDER",
    text: "I built it because running real businesses showed me the same problem again and again.",
  },
  {
    id: "origin-03",
    start: 11.391,
    end: 28.266,
    duration: 16.875,
    visual: "DISCONNECTED_SYSTEMS",
    text: "Finance knew one part of the business. Operations knew another. Customers, staff, suppliers and marketing all lived in different systems. Whenever I wanted to understand what was really happening, I had to put the company back together in my head.",
  },
  {
    id: "origin-04",
    start: 28.266,
    end: 30.375,
    duration: 2.109,
    visual: "FOUNDER",
    text: "That made one thing obvious.",
  },
  {
    id: "origin-05",
    start: 30.375,
    end: 37.547,
    duration: 7.172,
    visual: "AVANTIQO_INTELLIGENCE",
    text: "The business should not have to explain itself to its software. The software should understand the business.",
  },
  {
    id: "origin-06",
    start: 37.547,
    end: 40.078,
    duration: 2.531,
    visual: "FOUNDER",
    text: "That is why I built Avantiqo.",
  },
]);

const OPENING_AUDIO_SECONDS = OPENING_BEATS.at(-1).end;
const OPENING_TOTAL_SECONDS = LOGO_SECONDS + OPENING_AUDIO_SECONDS;

const SYSTEM_CARDS = Object.freeze([
  { label: "FINANCE", detail: "Money · Ledger · Close", x: 72, y: 128 },
  { label: "OPERATIONS", detail: "Work · Service · Execution", x: 72, y: 250 },
  { label: "CUSTOMERS", detail: "CRM · Revenue · History", x: 72, y: 372 },
  { label: "PEOPLE", detail: "Roles · Work · Payroll", x: 928, y: 128 },
  { label: "SUPPLIERS", detail: "Buy · Receive · Settle", x: 928, y: 250 },
  { label: "MARKETING", detail: "Campaigns · Channels · Results", x: 928, y: 372 },
]);

const THREAD_ARGS = [
  "-threads", "1",
  "-filter_threads", "1",
  "-filter_complex_threads", "1",
];

function jsonNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_INVESTOR_OPENING_RENDER_TIMEOUT"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const trace = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(trace.slice(-14000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(trace);
    });
  });
}

async function storageExists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(directory, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === file);
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`INVESTOR_OPENING_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return {
    bucket: BUCKET,
    path: storagePath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function makeCard(directory, index, card) {
  const target = path.join(directory, `card-${index}.png`);
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="280" height="86">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#11141b" stop-opacity=".94"/>
          <stop offset="1" stop-color="#05070a" stop-opacity=".88"/>
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="278" height="84" rx="18" fill="url(#g)" stroke="#d9bb78" stroke-opacity=".62" stroke-width="1.4"/>
      <rect x="12" y="13" width="3" height="60" rx="1.5" fill="#d9bb78" fill-opacity=".9"/>
      <text x="28" y="35" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="1.4" fill="#e5c988">${escapeXml(card.label)}</text>
      <text x="28" y="59" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#d2d4d8">${escapeXml(card.detail)}</text>
    </svg>
  `);
  await sharp(svg).png().toFile(target);
  return target;
}

async function makeIntelligenceFrame(directory) {
  const target = path.join(directory, "avantiqo-intelligence.png");
  const svg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
      <defs>
        <radialGradient id="bg" cx="50%" cy="45%" r="74%">
          <stop offset="0" stop-color="#111722"/>
          <stop offset=".52" stop-color="#06090e"/>
          <stop offset="1" stop-color="#020305"/>
        </radialGradient>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <g fill="none" stroke="#cbb071" stroke-opacity=".38" stroke-width="1.3">
        <path d="M310 174 C430 174 470 260 535 302"/>
        <path d="M310 296 C430 296 470 320 535 332"/>
        <path d="M310 418 C430 418 470 390 535 362"/>
        <path d="M970 174 C850 174 810 260 745 302"/>
        <path d="M970 296 C850 296 810 320 745 332"/>
        <path d="M970 418 C850 418 810 390 745 362"/>
      </g>
      <g font-family="Arial, Helvetica, sans-serif">
        <g fill="#090c12" stroke="#b99b5e" stroke-opacity=".55">
          <rect x="62" y="134" width="248" height="78" rx="18"/>
          <rect x="62" y="256" width="248" height="78" rx="18"/>
          <rect x="62" y="378" width="248" height="78" rx="18"/>
          <rect x="970" y="134" width="248" height="78" rx="18"/>
          <rect x="970" y="256" width="248" height="78" rx="18"/>
          <rect x="970" y="378" width="248" height="78" rx="18"/>
        </g>
        <g fill="#e4c987" font-size="12" font-weight="700" letter-spacing="1.1">
          <text x="84" y="168">FINANCE</text>
          <text x="84" y="290">OPERATIONS</text>
          <text x="84" y="412">CUSTOMERS</text>
          <text x="992" y="168">PEOPLE</text>
          <text x="992" y="290">SUPPLIERS</text>
          <text x="992" y="412">MARKETING</text>
        </g>
        <rect x="432" y="248" width="416" height="190" rx="30" fill="#070a0f" stroke="#e2c985" stroke-opacity=".78" stroke-width="2" filter="url(#glow)"/>
        <text x="640" y="302" text-anchor="middle" fill="#d4b873" font-size="12" font-weight="700" letter-spacing="2.3">ONE SHARED OPERATING CONTEXT</text>
        <text x="640" y="354" text-anchor="middle" fill="#ffffff" font-size="34" font-weight="700" letter-spacing="1.4">AVANTIQO</text>
        <text x="640" y="392" text-anchor="middle" fill="#ffffff" font-size="24" font-weight="600" letter-spacing="2.1">INTELLIGENCE</text>
        <text x="640" y="492" text-anchor="middle" fill="#989da7" font-size="13">information · decisions · execution</text>
      </g>
    </svg>
  `);
  await sharp(svg).png().toFile(target);
  return target;
}

async function renderLogo(ffmpeg, source, output) {
  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    "-i", source,
    "-t", String(LOGO_SECONDS),
    "-an",
    "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},fps=${FRAME_RATE},format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-r", String(FRAME_RATE),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderFounder(ffmpeg, source, output, duration, variant = 0) {
  const x = [0.5, 0.497, 0.503][variant % 3];
  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(duration),
    "-an",
    "-vf", [
      `scale=1368:770:force_original_aspect_ratio=increase`,
      `crop=${WIDTH}:${HEIGHT}:x='(in_w-out_w)*${x}':y='(in_h-out_h)*0.5'`,
      `fps=${FRAME_RATE}`,
      "eq=contrast=1.025:saturation=.96:brightness=-.005",
      "vignette=PI/10",
      "format=yuv420p",
    ].join(","),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-r", String(FRAME_RATE),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderDisconnectedSystems(ffmpeg, directory, output, duration) {
  const cards = [];
  for (const [index, card] of SYSTEM_CARDS.entries()) {
    cards.push(await makeCard(directory, index, card));
  }

  const inputs = [
    "-f", "lavfi", "-i", `color=c=#030509:s=${WIDTH}x${HEIGHT}:r=${FRAME_RATE}:d=${duration}`,
  ];
  for (const card of cards) {
    inputs.push("-loop", "1", "-framerate", String(FRAME_RATE), "-i", card);
  }

  const filters = [
    "[0:v]format=yuv420p,vignette=PI/8[base]",
  ];
  let previous = "base";

  SYSTEM_CARDS.forEach((card, index) => {
    const reveal = 0.5 + index * 1.65;
    const inputIndex = index + 1;
    const faded = `card${index}`;
    const next = `v${index}`;
    filters.push(
      `[${inputIndex}:v]format=rgba,fade=t=in:st=${reveal}:d=.55:alpha=1[${faded}]`,
    );
    filters.push(
      `[${previous}][${faded}]overlay=${card.x}:${card.y}:enable='gte(t,${reveal})'[${next}]`,
    );
    previous = next;
  });

  filters.push(
    `[${previous}]fade=t=in:st=0:d=.45,fade=t=out:st=${Math.max(0, duration - .5)}:d=.45,format=yuv420p[outv]`,
  );

  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[outv]",
    "-an",
    "-t", String(duration),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-r", String(FRAME_RATE),
    "-movflags", "+faststart",
    output,
  ]);
}

async function renderIntelligence(ffmpeg, directory, output, duration) {
  const frame = await makeIntelligenceFrame(directory);
  const frames = Math.max(1, Math.round(duration * FRAME_RATE));
  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    "-loop", "1",
    "-framerate", String(FRAME_RATE),
    "-i", frame,
    "-t", String(duration),
    "-an",
    "-vf", [
      `zoompan=z='1.0+0.028*(on/${frames})':d=1:s=${WIDTH}x${HEIGHT}:fps=${FRAME_RATE}`,
      "fade=t=in:st=0:d=.45",
      `fade=t=out:st=${Math.max(0, duration - .45)}:d=.4`,
      "format=yuv420p",
    ].join(","),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-r", String(FRAME_RATE),
    "-movflags", "+faststart",
    output,
  ]);
}

async function concatVisuals(ffmpeg, clips, output) {
  const listPath = `${output}.concat.txt`;
  await fs.writeFile(
    listPath,
    clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c", "copy",
    output,
  ]);
}

async function muxOpeningAudio(ffmpeg, visual, narration, output) {
  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    "-i", visual,
    "-ss", "0",
    "-t", String(OPENING_AUDIO_SECONDS),
    "-i", narration,
    "-filter_complex", `[1:a]adelay=${LOGO_SECONDS * 1000}|${LOGO_SECONDS * 1000},volume=1.0[a]`,
    "-map", "0:v:0",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-ar", "48000",
    "-t", String(OPENING_TOTAL_SECONDS),
    "-movflags", "+faststart",
    output,
  ]);
}

export function getAvantiqoInvestorOpeningAssemblyPlan() {
  return {
    contract: "AVANTIQO_INVESTOR_OPENING_ASSEMBLY_V1",
    organization_id: ORGANIZATION_ID,
    duration_seconds: OPENING_TOTAL_SECONDS,
    logo_seconds: LOGO_SECONDS,
    cedar_opening_seconds: OPENING_AUDIO_SECONDS,
    timing_source: "LOCKED_CEDAR_V5_DETERMINISTIC_229_5S_BASELINE",
    identity_policy: "APPROVED_FOUNDER_MOTION_ONLY",
    approved_founder_reference_asset_id: APPROVED_FOUNDER_REFERENCE_ASSET_ID,
    approved_founder_reference_sha256: APPROVED_FOUNDER_REFERENCE_SHA256,
    approved_founder_motion_sha256: APPROVED_FOUNDER_MOTION_SHA256,
    rejected_legacy_founder_asset_id: REJECTED_LEGACY_FOUNDER_ASSET_ID,
    legacy_founder_allowed: false,
    logo_path: APPROVED_LOGO_PATH,
    founder_motion_path: APPROVED_FOUNDER_MOTION_PATH,
    narration_path: LOCKED_CEDAR_PATH,
    output_path: OUTPUT_PATH,
    beats: OPENING_BEATS,
    visual_sequence: [
      { type: "APPROVED_3D_LOGO", start: 0, end: 8 },
      { type: "FOUNDER", start: 8, end: 19.391 },
      { type: "DISCONNECTED_SYSTEMS", start: 19.391, end: 36.266 },
      { type: "FOUNDER", start: 36.266, end: 38.375 },
      { type: "AVANTIQO_INTELLIGENCE", start: 38.375, end: 45.547 },
      { type: "FOUNDER", start: 45.547, end: 48.078 },
    ],
  };
}

export async function renderAvantiqoInvestorOpeningAssembly({ force = false } = {}) {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

  const required = [
    APPROVED_LOGO_PATH,
    APPROVED_FOUNDER_MOTION_PATH,
    LOCKED_CEDAR_PATH,
  ];
  for (const source of required) {
    if (!(await storageExists(source))) {
      throw new Error(`AVANTIQO_INVESTOR_OPENING_SOURCE_MISSING:${source}`);
    }
  }

  if (!force && await storageExists(OUTPUT_PATH)) {
    return {
      success: true,
      reused: true,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      plan: getAvantiqoInvestorOpeningAssemblyPlan(),
    };
  }

  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "avantiqo-investor-opening-"),
  );

  try {
    const logo = path.join(directory, "logo.mp4");
    const founderSource = path.join(directory, "founder-approved.mp4");
    const narration = path.join(directory, "cedar-v5.mp3");
    const founderA = path.join(directory, "founder-a.mp4");
    const systems = path.join(directory, "systems.mp4");
    const founderB = path.join(directory, "founder-b.mp4");
    const intelligence = path.join(directory, "intelligence.mp4");
    const founderC = path.join(directory, "founder-c.mp4");
    const visual = path.join(directory, "opening-visual.mp4");
    const finished = path.join(directory, "opening-finished.mp4");

    await Promise.all([
      download(APPROVED_LOGO_PATH, logo),
      download(APPROVED_FOUNDER_MOTION_PATH, founderSource),
      download(LOCKED_CEDAR_PATH, narration),
    ]);

    await renderLogo(ffmpeg, logo, path.join(directory, "shot-logo.mp4"));
    await renderFounder(ffmpeg, founderSource, founderA, 11.391, 0);
    await renderDisconnectedSystems(ffmpeg, directory, systems, 16.875);
    await renderFounder(ffmpeg, founderSource, founderB, 2.109, 1);
    await renderIntelligence(ffmpeg, directory, intelligence, 7.172);
    await renderFounder(ffmpeg, founderSource, founderC, 2.531, 2);

    await concatVisuals(ffmpeg, [
      path.join(directory, "shot-logo.mp4"),
      founderA,
      systems,
      founderB,
      intelligence,
      founderC,
    ], visual);

    await muxOpeningAudio(ffmpeg, visual, narration, finished);

    const stored = await upload(OUTPUT_PATH, finished);
    return {
      success: true,
      reused: false,
      output_path: OUTPUT_PATH,
      signed_url: await signedUrl(OUTPUT_PATH),
      bytes: stored.bytes,
      sha256: stored.sha256,
      duration_seconds: jsonNumber(OPENING_TOTAL_SECONDS),
      plan: getAvantiqoInvestorOpeningAssemblyPlan(),
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export const AvantiqoInvestorOpeningAssemblyRuntime = Object.freeze({
  plan: getAvantiqoInvestorOpeningAssemblyPlan,
  render: renderAvantiqoInvestorOpeningAssembly,
});
