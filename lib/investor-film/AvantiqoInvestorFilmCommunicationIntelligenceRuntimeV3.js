import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  resolveCreativeFfmpegPath,
  resolveCreativeFfprobePath,
} from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const CONTRACT = "AVANTIQO_COMMUNICATION_INTELLIGENCE_CINEMA_V3";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const OUTPUT_PATH = `${ORGANIZATION_ID}/avantiqo-investor-film-20260821/communication-intelligence-v3-911f.mp4`;
const FPS = 24;
const TARGET_FRAMES = 911;
const TARGET_DURATION = TARGET_FRAMES / FPS;
const THREAD_ARGS = ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];

const SOURCES = Object.freeze({
  manager: `${ORGANIZATION_ID}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  communications: `${ORGANIZATION_ID}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`,
  reveal: `${ORGANIZATION_ID}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
  restaurant: `${ORGANIZATION_ID}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  finance: `${ORGANIZATION_ID}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  field: `${ORGANIZATION_ID}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`,
});

const SCENES = Object.freeze([
  {
    id: "intent",
    source: "manager",
    frames: 120,
    eyebrow: "BUSINESS INTENT",
    title: "Tell Avantiqo the outcome. Not the steps.",
    subtitle: "Increase revenue tonight — without reducing margin.",
    variant: "intent",
  },
  {
    id: "communications",
    source: "communications",
    frames: 168,
    eyebrow: "COMMUNICATION NERVOUS SYSTEM",
    title: "Every message enters one business context.",
    subtitle: "Reviews, messages, DMs, email and web conversations arrive as business events — not isolated inboxes.",
    variant: "communications",
  },
  {
    id: "context",
    source: "reveal",
    frames: 156,
    eyebrow: "ONE OPERATING CONTEXT",
    title: "The answer can use the whole company.",
    subtitle: "Customer, Commercial, Operations, Finance, Supply Chain, People, Reputation and Creative share the same operating truth.",
    variant: "context",
  },
  {
    id: "ai",
    source: "manager",
    frames: 144,
    eyebrow: "SPECIALIST AI ORCHESTRATION",
    title: "The models are engines. Avantiqo is the intelligence layer.",
    subtitle: "Reasoning, image, video, voice and specialist models can be routed behind one governed business context.",
    variant: "ai",
  },
  {
    id: "execution",
    source: "restaurant",
    frames: 203,
    eyebrow: "AUTONOMOUS COMMUNICATION → ACTION",
    title: "The reply is only the beginning.",
    subtitle: "Avantiqo can answer — and when policy allows, complete the business action behind the answer.",
    variant: "execution",
  },
  {
    id: "learning",
    source: "finance",
    frames: 120,
    eyebrow: "CLOSED LOOP INTELLIGENCE",
    title: "Every outcome returns to the business memory.",
    subtitle: "Every message becomes business context. Every business context can become action.",
    variant: "learning",
  },
]);

const TOTAL_FRAMES = SCENES.reduce((sum, scene) => sum + scene.frames, 0);
if (TOTAL_FRAMES !== TARGET_FRAMES) {
  throw new Error(`COMMUNICATION_INTELLIGENCE_TIMELINE_INVALID:${TOTAL_FRAMES}`);
}

const CHANNELS = Object.freeze([
  { id: "google", label: "Google Reviews", color: "#4285F4", mark: "G", text: "#ffffff" },
  { id: "whatsapp", label: "WhatsApp", color: "#25D366", mark: "☎", text: "#ffffff" },
  { id: "line", label: "LINE", color: "#06C755", mark: "LINE", text: "#ffffff" },
  { id: "email", label: "Email", color: "#EA4335", mark: "M", text: "#ffffff" },
  { id: "facebook", label: "Facebook", color: "#1877F2", mark: "f", text: "#ffffff" },
  { id: "instagram", label: "Instagram", color: "url(#instagramGradient)", mark: "◎", text: "#ffffff" },
  { id: "messenger", label: "Messenger", color: "url(#messengerGradient)", mark: "↯", text: "#ffffff" },
  { id: "web", label: "Website", color: "#F2F2EE", mark: "◎", text: "#101114" },
]);

const AI_PROVIDERS = Object.freeze([
  { label: "OpenAI", color: "#111111", text: "#ffffff", mark: "OpenAI" },
  { label: "Claude", color: "#D97757", text: "#ffffff", mark: "Claude" },
  { label: "Gemini", color: "url(#geminiGradient)", text: "#ffffff", mark: "✦" },
  { label: "Veo", color: "#4285F4", text: "#ffffff", mark: "Veo" },
  { label: "Runway", color: "#FFFFFF", text: "#111111", mark: "R" },
  { label: "Flux", color: "#F2D24B", text: "#111111", mark: "FLUX" },
  { label: "Seedance", color: "#111111", text: "#ffffff", mark: "S" },
  { label: "ElevenLabs", color: "#FFFFFF", text: "#111111", mark: "Ⅱ" },
  { label: "Sora", color: "#171717", text: "#ffffff", mark: "Sora" },
  { label: "Kling AI", color: "#E63746", text: "#ffffff", mark: "K" },
  { label: "Luma", color: "#7C5CFF", text: "#ffffff", mark: "L" },
  { label: "Recraft", color: "#FF5C35", text: "#ffffff", mark: "R" },
  { label: "Mistral", color: "#F7A600", text: "#111111", mark: "M" },
  { label: "DeepSeek", color: "#4D6BFE", text: "#ffffff", mark: "D" },
]);

const DOMAIN_NODES = Object.freeze([
  "CUSTOMER",
  "COMMERCIAL",
  "OPERATIONS",
  "FINANCE",
  "SUPPLY CHAIN",
  "PEOPLE",
  "REPUTATION",
  "CREATIVE",
]);

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function run(command, args, timeoutMs = 330000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("COMMUNICATION_INTELLIGENCE_MEDIA_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(err.slice(-16000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve({ stdout: out, stderr: err });
    });
  });
}

async function storageExists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, {
    search: file,
    limit: 10,
  });
  if (error) return false;
  return (data || []).some((item) => item.name === file);
}

async function signedUrl(storagePath, seconds = 7200) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error(`COMMUNICATION_INTELLIGENCE_SIGNED_URL_MISSING:${storagePath}`);
  return data.signedUrl;
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
    metadata: {
      contract: CONTRACT,
      organization_id: ORGANIZATION_ID,
      exact_frames: TARGET_FRAMES,
      fps: FPS,
      visual_language: "OBSIDIAN_GOLD_WITH_AUTHENTIC_BRAND_COLOR_EDGES",
      communication_autonomy: true,
      specialist_ai_orchestration: true,
    },
  });
  if (error) throw error;
  return { path: storagePath, bytes: bytes.length, checksum };
}

function defs() {
  return `
    <defs>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#090b0f" stop-opacity="0.89"/>
        <stop offset="0.55" stop-color="#050608" stop-opacity="0.79"/>
        <stop offset="1" stop-color="#15120d" stop-opacity="0.72"/>
      </linearGradient>
      <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#806531" stop-opacity="0"/>
        <stop offset="0.5" stop-color="#D6A66A" stop-opacity="0.96"/>
        <stop offset="1" stop-color="#806531" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="instagramGradient" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#FEDA75"/>
        <stop offset="0.35" stop-color="#FA7E1E"/>
        <stop offset="0.62" stop-color="#D62976"/>
        <stop offset="1" stop-color="#4F5BD5"/>
      </linearGradient>
      <linearGradient id="messengerGradient" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#00B2FF"/>
        <stop offset="1" stop-color="#A033FF"/>
      </linearGradient>
      <linearGradient id="geminiGradient" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#4E7CFF"/>
        <stop offset="0.55" stop-color="#9F7AEA"/>
        <stop offset="1" stop-color="#E879F9"/>
      </linearGradient>
      <radialGradient id="halo" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#D6A66A" stop-opacity="0.19"/>
        <stop offset="1" stop-color="#D6A66A" stop-opacity="0"/>
      </radialGradient>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="13"/></filter>
    </defs>`;
}

function logoBadge(brand, x, y, width = 132) {
  const markWide = String(brand.mark || "").length > 2;
  const markSize = markWide ? 13 : 24;
  return `
    <g transform="translate(${x} ${y})">
      <rect x="0" y="0" width="${width}" height="42" rx="12" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.08"/>
      <rect x="8" y="7" width="28" height="28" rx="9" fill="${brand.color}"/>
      <text x="22" y="27" text-anchor="middle" fill="${brand.text}" font-family="Arial, Helvetica, sans-serif" font-size="${markSize}" font-weight="800">${esc(brand.mark)}</text>
      <text x="44" y="26" fill="#EEEDE8" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="600">${esc(brand.label)}</text>
    </g>`;
}

function header(scene) {
  return `
    <text x="72" y="74" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" letter-spacing="2.4">AVANTIQO · ${esc(scene.eyebrow)}</text>
    <text x="72" y="126" fill="#F5F3ED" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="650">${esc(scene.title)}</text>
    <text x="72" y="160" fill="#A9A8A2" font-family="Arial, Helvetica, sans-serif" font-size="15">${esc(scene.subtitle)}</text>
    <rect x="72" y="184" width="816" height="1" fill="url(#goldLine)"/>`;
}

function intentBody() {
  return `
    <rect x="74" y="226" width="812" height="194" rx="22" fill="#ffffff" fill-opacity="0.025" stroke="#ffffff" stroke-opacity="0.075"/>
    <text x="104" y="270" fill="#8E8C86" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" letter-spacing="2">OUTCOME CONTRACT</text>
    <text x="104" y="322" fill="#FAF8F2" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600">Increase revenue tonight</text>
    <text x="104" y="354" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="600">without reducing margin.</text>
    <g transform="translate(104 382)">
      <rect width="154" height="28" rx="9" fill="#D6A66A" fill-opacity="0.12" stroke="#D6A66A" stroke-opacity="0.34"/>
      <text x="77" y="19" text-anchor="middle" fill="#D8BB8A" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700">UNDERSTAND</text>
      <text x="174" y="19" fill="#6E6C67" font-family="Arial, Helvetica, sans-serif" font-size="14">→</text>
      <rect x="196" width="154" height="28" rx="9" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="273" y="19" text-anchor="middle" fill="#B8B5AD" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700">REASON</text>
      <text x="370" y="19" fill="#6E6C67" font-family="Arial, Helvetica, sans-serif" font-size="14">→</text>
      <rect x="392" width="154" height="28" rx="9" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.08"/>
      <text x="469" y="19" text-anchor="middle" fill="#B8B5AD" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700">EXECUTE</text>
    </g>`;
}

function communicationsBody() {
  const badges = CHANNELS.map((brand, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    return logoBadge(brand, 78 + col * 205, 215 + row * 58, 190);
  }).join("");
  return `${badges}
    <g transform="translate(74 354)">
      <rect width="812" height="112" rx="20" fill="#030405" fill-opacity="0.58" stroke="#D6A66A" stroke-opacity="0.22"/>
      <circle cx="64" cy="56" r="31" fill="url(#halo)"/>
      <circle cx="64" cy="56" r="20" fill="#D6A66A" fill-opacity="0.16" stroke="#D6A66A" stroke-opacity="0.66"/>
      <text x="64" y="61" text-anchor="middle" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="800">A</text>
      <text x="106" y="47" fill="#F6F4EE" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="650">ONE AVANTIQO INTELLIGENCE STREAM</text>
      <text x="106" y="74" fill="#999791" font-family="Arial, Helvetica, sans-serif" font-size="13">Language · customer identity · history · intent · urgency · policy · next action</text>
      <text x="744" y="61" text-anchor="end" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700">AUTO TRIAGE</text>
    </g>`;
}

function contextBody() {
  const centerX = 480;
  const centerY = 335;
  const radiusX = 330;
  const radiusY = 120;
  const nodes = DOMAIN_NODES.map((label, index) => {
    const angle = (Math.PI * 2 * index) / DOMAIN_NODES.length - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radiusX;
    const y = centerY + Math.sin(angle) * radiusY;
    return `
      <line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}" stroke="#D6A66A" stroke-opacity="0.16" stroke-width="1"/>
      <g transform="translate(${x - 64} ${y - 18})">
        <rect width="128" height="36" rx="11" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.09"/>
        <text x="64" y="23" text-anchor="middle" fill="#C9C6BE" font-family="Arial, Helvetica, sans-serif" font-size="9.5" font-weight="700">${esc(label)}</text>
      </g>`;
  }).join("");
  return `
    ${nodes}
    <circle cx="${centerX}" cy="${centerY}" r="78" fill="url(#halo)"/>
    <circle cx="${centerX}" cy="${centerY}" r="58" fill="#080807" fill-opacity="0.88" stroke="#D6A66A" stroke-opacity="0.55"/>
    <text x="${centerX}" y="${centerY - 7}" text-anchor="middle" fill="#F7F4EC" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="650">AVANTIQO</text>
    <text x="${centerX}" y="${centerY + 17}" text-anchor="middle" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700" letter-spacing="1.8">BUSINESS CONTEXT</text>
    <text x="480" y="488" text-anchor="middle" fill="#898781" font-family="Arial, Helvetica, sans-serif" font-size="12">The customer does not need to know which department owns the answer.</text>`;
}

function aiBody() {
  const badges = AI_PROVIDERS.map((brand, index) => {
    const col = index % 7;
    const row = Math.floor(index / 7);
    return logoBadge(brand, 32 + col * 132, 220 + row * 58, 124);
  }).join("");
  return `${badges}
    <g transform="translate(74 360)">
      <rect width="812" height="112" rx="20" fill="#050505" fill-opacity="0.70" stroke="#D6A66A" stroke-opacity="0.24"/>
      <text x="34" y="38" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700" letter-spacing="1.7">AVANTIQO ROUTING DECISION</text>
      <text x="34" y="70" fill="#F7F4ED" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="650">Best specialist engine for the capability, quality, cost and policy.</text>
      <text x="34" y="94" fill="#8D8A83" font-family="Arial, Helvetica, sans-serif" font-size="12">Context and authority stay with Avantiqo. Providers remain execution engines.</text>
    </g>`;
}

function executionBody() {
  const actions = [
    ["Google Review", "★★★★★  Amazing service", "Reply published automatically", "#4285F4"],
    ["WhatsApp", "Can I book a table for 8 tonight?", "Availability checked · booking created · replied", "#25D366"],
    ["Email", "Please resend my invoice.", "Finance record found · invoice sent", "#EA4335"],
    ["Website Chat", "Where is my technician?", "Live job status checked · customer updated", "#D6A66A"],
  ];
  return actions.map((item, index) => {
    const y = 216 + index * 66;
    return `
      <g transform="translate(72 ${y})">
        <rect width="816" height="54" rx="15" fill="#ffffff" fill-opacity="0.027" stroke="#ffffff" stroke-opacity="0.075"/>
        <circle cx="24" cy="27" r="8" fill="${item[3]}"/>
        <text x="44" y="22" fill="#F0EEE8" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700">${esc(item[0])}</text>
        <text x="44" y="40" fill="#8F8D87" font-family="Arial, Helvetica, sans-serif" font-size="11">${esc(item[1])}</text>
        <text x="790" y="31" text-anchor="end" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="700">${esc(item[2])}</text>
      </g>`;
  }).join("");
}

function learningBody() {
  return `
    <g transform="translate(70 224)">
      <circle cx="410" cy="115" r="92" fill="url(#halo)"/>
      <path d="M170 115 C235 20 330 10 410 47 C490 10 585 20 650 115 C585 210 490 220 410 183 C330 220 235 210 170 115Z" fill="none" stroke="#D6A66A" stroke-opacity="0.28" stroke-width="1.3"/>
      <circle cx="170" cy="115" r="31" fill="#080909" stroke="#ffffff" stroke-opacity="0.10"/>
      <text x="170" y="111" text-anchor="middle" fill="#F1EFE9" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700">MESSAGE</text>
      <text x="170" y="126" text-anchor="middle" fill="#85837D" font-family="Arial, Helvetica, sans-serif" font-size="8">SIGNAL</text>
      <circle cx="410" cy="115" r="50" fill="#090806" stroke="#D6A66A" stroke-opacity="0.56"/>
      <text x="410" y="111" text-anchor="middle" fill="#F6F3EC" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="650">AVANTIQO</text>
      <text x="410" y="129" text-anchor="middle" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="8" font-weight="700">UNDERSTAND · ACT · LEARN</text>
      <circle cx="650" cy="115" r="31" fill="#080909" stroke="#ffffff" stroke-opacity="0.10"/>
      <text x="650" y="111" text-anchor="middle" fill="#F1EFE9" font-family="Arial, Helvetica, sans-serif" font-size="9" font-weight="700">OUTCOME</text>
      <text x="650" y="126" text-anchor="middle" fill="#85837D" font-family="Arial, Helvetica, sans-serif" font-size="8">MEMORY</text>
      <text x="410" y="253" text-anchor="middle" fill="#D6A66A" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="650">YOUR BUSINESS. UNDERSTOOD. CONNECTED. IN MOTION.</text>
    </g>`;
}

function panelSvg(scene) {
  const body = {
    intent: intentBody,
    communications: communicationsBody,
    context: contextBody,
    ai: aiBody,
    execution: executionBody,
    learning: learningBody,
  }[scene.variant]?.() || "";

  return Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
    ${defs()}
    <rect x="17" y="18" width="926" height="504" rx="31" fill="#000000" fill-opacity="0.43" filter="url(#shadow)"/>
    <rect x="20" y="20" width="920" height="500" rx="30" fill="url(#glass)" stroke="#D6A66A" stroke-opacity="0.42" stroke-width="1.2"/>
    <rect x="20" y="20" width="920" height="500" rx="30" fill="none" stroke="#ffffff" stroke-opacity="0.035"/>
    ${header(scene)}
    ${body}
  </svg>`);
}

async function makePanelRaw(directory, scene) {
  const target = path.join(directory, `panel-${scene.id}.rgba`);
  const bytes = await sharp(panelSvg(scene)).ensureAlpha().raw().toBuffer();
  await fs.writeFile(target, bytes);
  return target;
}

function easeExpression(start, end, from, to) {
  const progress = `(t-${start})/(${end}-${start})`;
  const eased = `(${progress}*${progress}*(3-2*${progress}))`;
  return `if(lt(t,${start}),${from},if(lt(t,${end}),${from}+(${to}-${from})*${eased},${to}))`;
}

async function renderScene(ffmpeg, sourceUrl, panelRaw, scene, output) {
  const duration = scene.frames / FPS;
  const riseStart = 0.30;
  const riseEnd = Math.min(1.35, duration * 0.28);
  const fadeOut = Math.max(riseEnd + 0.4, duration - 0.42);
  const originWidth = 520;
  const originHeight = 292;
  const targetWidth = 1540;
  const targetHeight = 866;
  const width = easeExpression(riseStart, riseEnd, originWidth, targetWidth);
  const height = easeExpression(riseStart, riseEnd, originHeight, targetHeight);
  const x = easeExpression(riseStart, riseEnd, 1000, 190);
  const y = easeExpression(riseStart, riseEnd, 640, 108);

  const filter = [
    `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=${FPS},setsar=1,setpts=PTS-STARTPTS,eq=contrast=1.055:saturation=.79:brightness=-.028[base]`,
    `[base]drawbox=x=0:y=0:w=1920:h=1080:color=black@0.16:t=fill[graded]`,
    `[1:v]setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=${riseStart}:d=0.24:alpha=1,fade=t=out:st=${fadeOut}:d=0.32:alpha=1,scale=w='${width}':h='${height}':eval=frame[glass]`,
    `[graded][glass]overlay=x='${x}':y='${y}':eval=frame:repeatlast=1:shortest=0,format=yuv420p[v]`,
  ].join(";");

  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    "-stream_loop", "-1", "-i", sourceUrl,
    "-stream_loop", "-1",
    "-f", "rawvideo",
    "-pixel_format", "rgba",
    "-video_size", "960x540",
    "-framerate", String(FPS),
    "-i", panelRaw,
    "-filter_complex", filter,
    "-map", "[v]",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "17",
    "-r", String(FPS),
    "-frames:v", String(scene.frames),
    "-movflags", "+faststart",
    output,
  ]);
}

async function concatenate(ffmpeg, files, output) {
  const args = ["-y", ...THREAD_ARGS];
  files.forEach((file) => args.push("-i", file));
  const reset = files.map((_, index) => `[${index}:v]fps=${FPS},setpts=PTS-STARTPTS[v${index}]`).join(";");
  const inputs = files.map((_, index) => `[v${index}]`).join("");
  const filter = `${reset};${inputs}concat=n=${files.length}:v=1:a=0,format=yuv420p[vout]`;
  args.push(
    "-filter_complex", filter,
    "-map", "[vout]",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "17",
    "-r", String(FPS),
    "-frames:v", String(TARGET_FRAMES),
    "-movflags", "+faststart",
    output,
  );
  await run(ffmpeg, args);
}

async function probe(file) {
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffprobe) throw new Error("COMMUNICATION_INTELLIGENCE_FFPROBE_NOT_READY");
  const { stdout, stderr } = await run(ffprobe, [
    "-v", "error",
    "-count_frames",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames:format=duration",
    "-of", "json",
    file,
  ], 90000);
  try {
    return JSON.parse(stdout || "{}");
  } catch {
    throw new Error(`COMMUNICATION_INTELLIGENCE_PROBE_INVALID:${stderr.slice(-500)}`);
  }
}

export const AvantiqoInvestorFilmCommunicationIntelligenceRuntimeV3 = {
  CONTRACT,
  BUCKET,
  ORGANIZATION_ID,
  OUTPUT_PATH,
  FPS,
  TARGET_FRAMES,
  TARGET_DURATION,
  SCENES,

  async status() {
    const source_readiness = {};
    for (const [key, storagePath] of Object.entries(SOURCES)) {
      source_readiness[key] = await storageExists(storagePath);
    }
    return {
      contract: CONTRACT,
      ready: await storageExists(OUTPUT_PATH),
      output_path: OUTPUT_PATH,
      source_readiness,
      scene_count: SCENES.length,
      exact_frames: TARGET_FRAMES,
      duration_seconds: TARGET_DURATION,
      frame_rate: FPS,
      colored_brand_logos: true,
      communication_channels: CHANNELS.map((item) => item.label),
      specialist_ai_provider_count: AI_PROVIDERS.length,
      specialist_ai_providers: AI_PROVIDERS.map((item) => item.label),
      policies: {
        avantiqo_visual_language: "BLACK_GRAPHITE_GOLD",
        provider_channel_brand_colors_preserved: true,
        provider_logos_edge_only: true,
        provider_logos_do_not_replace_avantiqo_identity: true,
        communication_autonomy: true,
        human_escalation_for_policy_exceptions: true,
      },
    };
  },

  async downloadUrl(seconds = 86400) {
    if (!(await storageExists(OUTPUT_PATH))) return null;
    return signedUrl(OUTPUT_PATH, seconds);
  },

  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("COMMUNICATION_INTELLIGENCE_FFMPEG_NOT_READY");

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-communication-intelligence-v3-"));
    try {
      const urls = {};
      for (const [key, storagePath] of Object.entries(SOURCES)) {
        if (!(await storageExists(storagePath))) throw new Error(`COMMUNICATION_INTELLIGENCE_SOURCE_MISSING:${key}`);
        urls[key] = await signedUrl(storagePath, 7200);
      }

      const segments = [];
      for (let index = 0; index < SCENES.length; index += 1) {
        const scene = SCENES[index];
        const panelRaw = await makePanelRaw(directory, scene);
        const segment = path.join(directory, `scene-${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`);
        await renderScene(ffmpeg, urls[scene.source], panelRaw, scene, segment);
        segments.push(segment);
      }

      const final = path.join(directory, "communication-intelligence-v3.mp4");
      await concatenate(ffmpeg, segments, final);
      const media = await probe(final);
      const stream = media?.streams?.[0] || {};
      const frames = Number(stream.nb_read_frames || 0);
      const duration = Number(media?.format?.duration || 0);
      if (frames !== TARGET_FRAMES) throw new Error(`COMMUNICATION_INTELLIGENCE_FRAME_COUNT_INVALID:${frames}`);
      if (Number(stream.width) !== 1920 || Number(stream.height) !== 1080) throw new Error("COMMUNICATION_INTELLIGENCE_DIMENSIONS_INVALID");
      if (stream.r_frame_rate !== "24/1") throw new Error(`COMMUNICATION_INTELLIGENCE_FPS_INVALID:${stream.r_frame_rate}`);
      if (Math.abs(duration - TARGET_DURATION) > 0.08) throw new Error(`COMMUNICATION_INTELLIGENCE_DURATION_INVALID:${duration}`);

      const stored = await upload(OUTPUT_PATH, final);
      return {
        success: true,
        contract: CONTRACT,
        output: stored,
        signed_url: await signedUrl(OUTPUT_PATH, 86400),
        exact_frames: frames,
        duration_seconds: duration,
        frame_rate: stream.r_frame_rate,
        width: Number(stream.width),
        height: Number(stream.height),
        colored_brand_logos: true,
        communication_autonomy: true,
        specialist_ai_orchestration: true,
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
