#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import sharp from "sharp";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_RESULT_AUDIT_V1";
const PACKAGE_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_EDITORIAL_TRIAGE_PACKAGE_V1";
const FRAME_FRACTIONS = [0.02, 0.18, 0.34, 0.5, 0.66, 0.82, 0.98];
const PROXY_WIDTH = 960;
const PROXY_HEIGHT = 540;
const FRAME_WIDTH = 480;
const FRAME_HEIGHT = 270;
const CARD_HEIGHT = 310;
const CONTACT_COLUMNS = 4;
const CONTACT_ROWS = 2;
const CONTACT_HEADER_HEIGHT = 150;

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function readJson(rawPath, label) {
  const absolute = path.resolve(text(rawPath));
  return fs.readFile(absolute, "utf8").then((raw) => ({
    absolute,
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  })).catch((error) => {
    throw new Error(`${label}_READ_FAILED:${absolute}:${error.message}`);
  });
}

function safeName(value, fallback = "item") {
  return text(value || fallback)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeSvg(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value || 0));
  return `${seconds.toFixed(3)}s`;
}

function run(command, args, { allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        code: Number.isInteger(code) ? code : 1,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (!allowFailure && (signal || result.code !== 0)) {
        reject(new Error(
          result.stderr || result.stdout ||
            `${command} failed with ${signal || result.code}`,
        ));
        return;
      }
      resolve(result);
    });
  });
}

async function assertExecutable(command) {
  const result = await run(command, ["-version"], { allowFailure: true });
  if (result.code !== 0) throw new Error(`${command.toUpperCase()}_REQUIRED`);
}

async function ffprobe(filePath) {
  const result = await run("ffprobe", [
    "-v", "error",
    "-show_format",
    "-show_streams",
    "-of", "json",
    filePath,
  ]);
  const value = JSON.parse(result.stdout);
  const streams = list(value.streams);
  const video = streams.find((stream) => stream.codec_type === "video") || {};
  const audio = streams.find((stream) => stream.codec_type === "audio") || null;
  const duration = Number(
    value.format?.duration || video.duration || audio?.duration || 0,
  );
  return {
    duration_seconds: Number.isFinite(duration) ? duration : 0,
    width: Number(video.width || 0),
    height: Number(video.height || 0),
    video_codec: text(video.codec_name) || null,
    pixel_format: text(video.pix_fmt) || null,
    frame_rate: text(video.avg_frame_rate || video.r_frame_rate) || null,
    audio_present: Boolean(audio),
    audio_codec: text(audio?.codec_name) || null,
    container: text(value.format?.format_name) || null,
    file_size_bytes: Number(value.format?.size || 0),
  };
}

function thresholdKey(scoreKey) {
  const mapping = {
    overall: "minimum_overall_score",
    story: "minimum_story_score",
    environment: "minimum_environment_score",
    camera: "minimum_camera_score",
    anatomy: "minimum_anatomy_score",
    identity: "minimum_identity_score",
    product: "minimum_product_fidelity_score",
    music: "minimum_music_energy_score",
    performance: "minimum_performance_score",
    continuity: "minimum_continuity_score",
    physics: "minimum_physics_score",
    artifacts: "minimum_artifact_score",
  };
  return mapping[scoreKey] || null;
}

function scoreValue(result, scoreKey) {
  const mapping = {
    overall: "overall_score",
    story: "story_score",
    environment: "environment_score",
    camera: "camera_score",
    anatomy: "anatomy_score",
    identity: "identity_score",
    product: "product_fidelity_score",
    music: "music_energy_score",
    performance: "performance_score",
    continuity: "continuity_score",
    physics: "physics_score",
    artifacts: "artifact_score",
  };
  const value = Number(result.scores?.[mapping[scoreKey]]);
  return Number.isFinite(value) ? value : null;
}

function scoreDeficit(result, scoreKey) {
  const key = thresholdKey(scoreKey);
  const score = scoreValue(result, scoreKey);
  const threshold = Number(result.thresholds?.[key]);
  if (!key || score === null || !Number.isFinite(threshold)) return null;
  return Number(Math.max(0, threshold - score).toFixed(3));
}

function editorialClassification(result = {}) {
  const falseScores = new Set(list(result.false_score_checks).map(text));
  const failures = list(result.failures).map(text);
  const combined = failures.join(" ").toLowerCase();
  const hardScoreNames = [
    "story",
    "environment",
    "anatomy",
    "identity",
    "product",
    "music",
    "performance",
    "physics",
  ];
  const hardScores = hardScoreNames.filter((key) => falseScores.has(key));
  const hardLanguage = /\b(no person|missing|identity|product|dish|drink|wardrobe|guest|waitstaff|band|musician|performance|environment|story|architecture|logo|text|watermark|spatial geography|screen direction)\b/i.test(combined);
  const deficits = [...falseScores]
    .map((key) => scoreDeficit(result, key))
    .filter((value) => value !== null);
  const maximumDeficit = deficits.length ? Math.max(...deficits) : null;
  const onlyEditorialScores = [...falseScores].every((key) =>
    ["camera", "continuity", "overall"].includes(key),
  );

  if (onlyEditorialScores && !hardLanguage) {
    return {
      category: "FFMPEG_SALVAGE_CANDIDATE",
      reason:
        "Failures are limited to camera, continuity or overall polish and may improve through trimming, stabilization, reframing or pacing.",
      generate_stabilized_variant: true,
      maximum_score_deficit: maximumDeficit,
    };
  }

  if (
    hardScores.length <= 2 &&
    maximumDeficit !== null &&
    maximumDeficit <= 2 &&
    !/\b(no person|missing|architecture|logo|text|watermark)\b/i.test(combined)
  ) {
    return {
      category: "MANUAL_EDITORIAL_DECISION",
      reason:
        "The numerical miss is narrow, but identity, product, story or continuity concerns require visual inspection before editing or regeneration.",
      generate_stabilized_variant: false,
      maximum_score_deficit: maximumDeficit,
    };
  }

  return {
    category: "LIKELY_REGENERATION",
    reason:
      "The review identifies missing or incorrect content, identity, product, environment, story or performance that FFmpeg cannot reliably create.",
    generate_stabilized_variant: false,
    maximum_score_deficit: maximumDeficit,
  };
}

function taskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    provider_id: task.provider_id ?? null,
    cost: task.cost || {},
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
  );
}

function taskCounts(tasks = []) {
  return tasks.reduce((result, task) => {
    const status = text(task.status) || "UNKNOWN";
    result[status] = Number(result[status] || 0) + 1;
    return result;
  }, {});
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      production_graph_id: graphId,
    }),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,reserved_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  const scopedTasks = tasks.filter(
    (task) => text(task.production_graph_id) === graphId,
  );
  return {
    tasks: scopedTasks,
    task_count: scopedTasks.length,
    task_status_counts: taskCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_reserved_balance: money(wallet.data?.reserved_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

async function extractProxy({ input, output }) {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-i", input,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf",
    `scale=${PROXY_WIDTH}:${PROXY_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PROXY_WIDTH}:${PROXY_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    output,
  ]);
}

async function extractStabilizedProxy({ input, output }) {
  return run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-i", input,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf",
    `deshake=rx=16:ry=16:edge=mirror,scale=${PROXY_WIDTH}:${PROXY_HEIGHT}:force_original_aspect_ratio=decrease,pad=${PROXY_WIDTH}:${PROXY_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    "-y",
    output,
  ], { allowFailure: true });
}

async function extractFrame({ input, timestamp, output }) {
  await run("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-ss", String(timestamp),
    "-i", input,
    "-frames:v", "1",
    "-vf",
    `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
    "-q:v", "2",
    "-y",
    output,
  ]);
}

async function buildContactSheet({
  frames,
  output,
  title,
  subtitle,
  category,
}) {
  const width = CONTACT_COLUMNS * FRAME_WIDTH;
  const height = CONTACT_HEADER_HEIGHT + CONTACT_ROWS * CARD_HEIGHT;
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 12, g: 12, b: 14 },
    },
  });
  const composites = [];
  const header = Buffer.from(`
    <svg width="${width}" height="${CONTACT_HEADER_HEIGHT}">
      <rect width="100%" height="100%" fill="#0c0c0e"/>
      <text x="40" y="48" fill="#ffffff" font-size="28" font-family="Arial, sans-serif" font-weight="700">${escapeSvg(title)}</text>
      <text x="40" y="86" fill="#c5c5c5" font-size="18" font-family="Arial, sans-serif">${escapeSvg(subtitle)}</text>
      <text x="40" y="122" fill="#f2c76e" font-size="20" font-family="Arial, sans-serif" font-weight="700">${escapeSvg(category)}</text>
    </svg>
  `);
  composites.push({ input: header, left: 0, top: 0 });

  for (const [index, frame] of frames.entries()) {
    const left = (index % CONTACT_COLUMNS) * FRAME_WIDTH;
    const top = CONTACT_HEADER_HEIGHT +
      Math.floor(index / CONTACT_COLUMNS) * CARD_HEIGHT;
    composites.push({ input: frame.file, left, top });
    const label = Buffer.from(`
      <svg width="${FRAME_WIDTH}" height="40">
        <rect width="100%" height="100%" fill="#151518"/>
        <text x="14" y="26" fill="#ffffff" font-size="17" font-family="Arial, sans-serif">Frame ${index + 1} · ${escapeSvg(formatSeconds(frame.timestamp_seconds))}</text>
      </svg>
    `);
    composites.push({
      input: label,
      left,
      top: top + FRAME_HEIGHT,
    });
  }

  await canvas.composite(composites).jpeg({ quality: 90 }).toFile(output);
}

function notesMarkdown({ result, classification, technical }) {
  const scoreLines = list(result.false_score_checks).map((key) => {
    const score = scoreValue(result, key);
    const threshold = Number(result.thresholds?.[thresholdKey(key)]);
    return `- ${key}: ${score ?? "unknown"} / minimum ${Number.isFinite(threshold) ? threshold : "unknown"}`;
  });
  return [
    `# Editorial triage: ${result.review_task_id}`,
    "",
    `- Source task: ${result.source_task_id}`,
    `- Asset node: ${result.asset_node_id}`,
    `- Category: ${classification.category}`,
    `- Reason: ${classification.reason}`,
    `- Duration: ${formatSeconds(technical.duration_seconds)}`,
    `- Source dimensions: ${technical.width}x${technical.height}`,
    `- Video codec: ${technical.video_codec || "unknown"}`,
    `- Audio present: ${technical.audio_present ? "yes" : "no"}`,
    "",
    "## Failed score checks",
    "",
    ...(scoreLines.length ? scoreLines : ["- None recorded"]),
    "",
    "## Provider failures",
    "",
    ...(list(result.failures).length
      ? list(result.failures).map((value) => `- ${value}`)
      : ["- None recorded"]),
    "",
    "## Provider repair instructions",
    "",
    ...(list(result.repair_instructions).length
      ? list(result.repair_instructions).map((value) => `- ${value}`)
      : ["- None recorded"]),
    "",
    "## Editing rule",
    "",
    classification.category === "FFMPEG_SALVAGE_CANDIDATE"
      ? "Compare the original proxy with the stabilization candidate. Trim weak opening or closing frames and reject the variant if stabilization introduces warping."
      : classification.category === "MANUAL_EDITORIAL_DECISION"
        ? "Inspect the proxy and contact sheet manually. FFmpeg may trim a localized flaw, but it cannot correct identity or product content across the shot."
        : "Preserve the asset as evidence. Do not use FFmpeg to disguise missing or incorrect story, identity, product, environment or performance content.",
    "",
  ].join("\n");
}

function packageHtml({ manifest }) {
  const cards = manifest.items.map((item) => `
    <article class="card ${escapeHtml(item.editorial.category.toLowerCase())}">
      <div class="card-head">
        <span class="index">${String(item.sequence).padStart(2, "0")}</span>
        <div>
          <h2>${escapeHtml(item.editorial.category)}</h2>
          <p>${escapeHtml(item.review_task_id)}</p>
        </div>
      </div>
      <a href="${escapeHtml(item.files.contact_sheet)}">
        <img src="${escapeHtml(item.files.contact_sheet)}" alt="Contact sheet">
      </a>
      <p class="reason">${escapeHtml(item.editorial.reason)}</p>
      <div class="links">
        <a href="${escapeHtml(item.files.original)}">Original</a>
        <a href="${escapeHtml(item.files.proxy)}">Proxy</a>
        ${item.files.stabilized_proxy
          ? `<a href="${escapeHtml(item.files.stabilized_proxy)}">Stabilized candidate</a>`
          : ""}
        <a href="${escapeHtml(item.files.notes)}">Review notes</a>
      </div>
      <dl>
        <dt>Duration</dt><dd>${escapeHtml(formatSeconds(item.technical.duration_seconds))}</dd>
        <dt>Failed scores</dt><dd>${escapeHtml(item.review.false_score_checks.join(", ") || "none")}</dd>
        <dt>Provider failures</dt><dd>${item.review.failure_count}</dd>
        <dt>Max score deficit</dt><dd>${item.editorial.maximum_score_deficit ?? "unknown"}</dd>
      </dl>
    </article>
  `).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Churchill Editorial Triage</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #09090b; color: #f5f5f5; font-family: Arial, sans-serif; }
  header { padding: 36px 5vw 26px; border-bottom: 1px solid #29292d; }
  h1 { margin: 0 0 12px; font-size: clamp(30px, 5vw, 60px); }
  header p { color: #babac1; max-width: 900px; line-height: 1.5; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 20px; }
  .pill { padding: 9px 13px; border: 1px solid #38383e; border-radius: 999px; }
  main { padding: 28px 5vw 70px; display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 24px; }
  .card { border: 1px solid #29292f; border-radius: 16px; overflow: hidden; background: #111114; }
  .card-head { display: flex; gap: 14px; align-items: center; padding: 18px; }
  .index { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: #26262b; font-weight: 700; }
  h2 { margin: 0 0 5px; font-size: 17px; }
  .card-head p { margin: 0; color: #8f8f98; font-size: 12px; }
  img { width: 100%; display: block; }
  .reason { padding: 0 18px; color: #ccccd2; line-height: 1.45; }
  .links { display: flex; flex-wrap: wrap; gap: 9px; padding: 10px 18px 18px; }
  .links a { color: #111; background: #e9c36c; padding: 8px 11px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px; }
  dl { display: grid; grid-template-columns: 130px 1fr; gap: 7px 12px; margin: 0; padding: 16px 18px 22px; border-top: 1px solid #29292f; font-size: 13px; }
  dt { color: #888893; } dd { margin: 0; }
  .ffmpeg_salvage_candidate { border-color: #8e713a; }
  .manual_editorial_decision { border-color: #526b8c; }
  .likely_regeneration { border-color: #7b4141; }
</style>
</head>
<body>
<header>
  <h1>Churchill editorial triage</h1>
  <p>Nine preserved generated videos, their OpenAI review evidence, contact sheets, review proxies, and non-destructive FFmpeg stabilization candidates. This package does not approve, publish, regenerate, or modify production records.</p>
  <div class="summary">
    <span class="pill">Videos: ${manifest.item_count}</span>
    <span class="pill">FFmpeg candidates: ${manifest.category_counts.FFMPEG_SALVAGE_CANDIDATE || 0}</span>
    <span class="pill">Manual decisions: ${manifest.category_counts.MANUAL_EDITORIAL_DECISION || 0}</span>
    <span class="pill">Likely regeneration: ${manifest.category_counts.LIKELY_REGENERATION || 0}</span>
  </div>
</header>
<main>${cards}</main>
</body>
</html>`;
}

const auditFile = await readJson(
  process.argv[2],
  "REPLACEMENT_REVIEW_RESULT_AUDIT",
);
const audit = object(auditFile.value);
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputRoot = path.resolve(
  text(process.env.CHURCHILL_EDITORIAL_TRIAGE_OUTPUT) ||
    path.join(
      process.cwd(),
      ".artifacts",
      `churchill-editorial-triage-${auditFile.file_sha256.slice(0, 12)}`,
    ),
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("EDITORIAL_TRIAGE_SCOPE_REQUIRED");
}
if (
  text(audit.contract) !== AUDIT_CONTRACT ||
  text(audit.organization_id) !== organizationId ||
  text(audit.creative_project_id) !== projectId ||
  text(audit.production_graph_id) !== graphId ||
  text(audit.decision) !==
    "REPLACEMENT_REVIEW_NINE_PROVIDER_CONTENT_REJECTIONS_IDENTIFIED" ||
  text(audit.readiness) !== "READY_FOR_EDITORIAL_TRIAGE_BEFORE_REGENERATION" ||
  Number(audit.review_task_count) !== 9 ||
  Number(audit.asset_preserved_count) !== 9 ||
  list(audit.blockers).length !== 0 ||
  audit.state_unchanged !== true
) {
  throw new Error("EDITORIAL_TRIAGE_AUDIT_NOT_READY");
}

await assertExecutable("ffmpeg");
await assertExecutable("ffprobe");

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { materializeMedia },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/media/runtime/CreativeMediaInspectionRuntime"),
]);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
if (
  before.task_state_sha256 !== text(audit.exact_state_after?.task_state_sha256) ||
  before.usage_count !== Number(audit.exact_state_after?.usage_count) ||
  before.wallet_balance !== money(audit.exact_state_after?.wallet_balance) ||
  before.wallet_reserved_balance !==
    money(audit.exact_state_after?.wallet_reserved_balance)
) {
  throw new Error("EDITORIAL_TRIAGE_LIVE_STATE_CHANGED");
}

const manifestPath = path.join(outputRoot, "manifest.json");
try {
  const existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    text(existing.contract) === PACKAGE_CONTRACT &&
    text(existing.audit_file_sha256) === auditFile.file_sha256 &&
    existing.completed === true
  ) {
    console.log("EDITORIAL_TRIAGE_PACKAGE_ALREADY_COMPLETE=YES");
    console.log(`OUTPUT_ROOT=${outputRoot}`);
    console.log(`INDEX_HTML=${path.join(outputRoot, "index.html")}`);
    console.log(`MANIFEST=${manifestPath}`);
    console.log("TERMINAL_REMAINS_OPEN=YES");
    process.exit(0);
  }
  throw new Error("EDITORIAL_TRIAGE_OUTPUT_ALREADY_EXISTS_INCOMPLETE");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

for (const directory of [
  outputRoot,
  path.join(outputRoot, "originals"),
  path.join(outputRoot, "proxies"),
  path.join(outputRoot, "stabilized"),
  path.join(outputRoot, "frames"),
  path.join(outputRoot, "contact-sheets"),
  path.join(outputRoot, "notes"),
  path.join(outputRoot, "metadata"),
]) {
  await fs.mkdir(directory, { recursive: true });
}

await fs.copyFile(auditFile.absolute, path.join(outputRoot, "metadata", "review-result-audit.json"));

const results = list(audit.results);
const assetIds = results.map((result) => text(result.asset_node_id));
const assetResponse = await supabaseAdmin
  .from("creative_asset_nodes")
  .select("id,type,status,production_task_id,metadata,url,storage_path")
  .in("id", assetIds);
if (assetResponse.error) throw assetResponse.error;
const assetMap = new Map(
  list(assetResponse.data).map((asset) => [text(asset.id), asset]),
);
if (assetMap.size !== 9) throw new Error("EDITORIAL_TRIAGE_ASSET_SET_INCOMPLETE");

const items = [];
for (const [index, result] of results.entries()) {
  const sequence = index + 1;
  const asset = assetMap.get(text(result.asset_node_id));
  const reference = text(asset?.url || asset?.storage_path);
  if (
    !asset ||
    text(asset.type) !== "VIDEO" ||
    text(asset.status) !== "GENERATED" ||
    text(asset.metadata?.inspection_status) !== "COMPLETE" ||
    !reference
  ) {
    throw new Error(`EDITORIAL_TRIAGE_ASSET_INVALID:${result.asset_node_id}`);
  }

  const classification = editorialClassification(result);
  const base = `${String(sequence).padStart(2, "0")}-${safeName(result.review_task_id).slice(0, 16)}`;
  const originalPath = path.join(outputRoot, "originals", `${base}-original.mp4`);
  const proxyPath = path.join(outputRoot, "proxies", `${base}-proxy.mp4`);
  const stabilizedPath = path.join(outputRoot, "stabilized", `${base}-stabilized.mp4`);
  const framesDirectory = path.join(outputRoot, "frames", base);
  const contactPath = path.join(outputRoot, "contact-sheets", `${base}-contact.jpg`);
  const notesPath = path.join(outputRoot, "notes", `${base}-notes.md`);
  await fs.mkdir(framesDirectory, { recursive: true });

  const materialized = await materializeMedia({
    url: reference,
    file_name: `${base}.mp4`,
    mime_type: "video/mp4",
    organization_id: organizationId,
    policy: {
      max_bytes: 1024 * 1024 * 1024,
      timeout_ms: 180_000,
      max_redirects: 4,
    },
  });

  try {
    await fs.copyFile(materialized.file_path, originalPath);
  } finally {
    await materialized.cleanup();
  }

  const technical = await ffprobe(originalPath);
  if (technical.duration_seconds <= 0 || technical.width <= 0 || technical.height <= 0) {
    throw new Error(`EDITORIAL_TRIAGE_PROBE_INVALID:${result.review_task_id}`);
  }

  await extractProxy({ input: originalPath, output: proxyPath });

  const frameRecords = [];
  for (const [frameIndex, fraction] of FRAME_FRACTIONS.entries()) {
    const timestamp = Math.max(
      0,
      Math.min(
        technical.duration_seconds - 0.04,
        technical.duration_seconds * fraction,
      ),
    );
    const framePath = path.join(
      framesDirectory,
      `frame-${String(frameIndex + 1).padStart(2, "0")}.jpg`,
    );
    await extractFrame({
      input: originalPath,
      timestamp: Number(timestamp.toFixed(6)),
      output: framePath,
    });
    frameRecords.push({
      index: frameIndex + 1,
      fraction,
      timestamp_seconds: Number(timestamp.toFixed(6)),
      file: framePath,
      relative_file: path.relative(outputRoot, framePath),
    });
  }

  await buildContactSheet({
    frames: frameRecords,
    output: contactPath,
    title: `Shot ${String(sequence).padStart(2, "0")} · ${result.review_task_id}`,
    subtitle: `Failed scores: ${list(result.false_score_checks).join(", ") || "none"}`,
    category: classification.category,
  });

  let stabilizedProxy = null;
  let stabilizedStatus = "NOT_REQUESTED";
  let stabilizedError = null;
  if (classification.generate_stabilized_variant) {
    const stabilization = await extractStabilizedProxy({
      input: originalPath,
      output: stabilizedPath,
    });
    if (stabilization.code === 0) {
      stabilizedProxy = path.relative(outputRoot, stabilizedPath);
      stabilizedStatus = "CREATED";
    } else {
      stabilizedStatus = "FAILED_NON_BLOCKING";
      stabilizedError = text(stabilization.stderr || stabilization.stdout)
        .split("\n")
        .slice(-5)
        .join(" ")
        .slice(0, 800);
    }
  }

  await fs.writeFile(
    notesPath,
    `${notesMarkdown({ result, classification, technical })}\n`,
    "utf8",
  );

  const item = {
    sequence,
    review_task_id: result.review_task_id,
    source_task_id: result.source_task_id,
    asset_node_id: result.asset_node_id,
    editorial: {
      ...classification,
      stabilization_status: stabilizedStatus,
      stabilization_error: stabilizedError,
    },
    technical,
    review: {
      classification: result.classification,
      false_score_checks: list(result.false_score_checks),
      false_evidence_checks: list(result.false_evidence_checks),
      failure_count: Number(result.failure_count || 0),
      repair_instruction_count: Number(result.repair_instruction_count || 0),
      scores: object(result.scores),
      thresholds: object(result.thresholds),
      failures: list(result.failures),
      repair_instructions: list(result.repair_instructions),
    },
    frames: frameRecords.map(({ file, ...frame }) => frame),
    files: {
      original: path.relative(outputRoot, originalPath),
      proxy: path.relative(outputRoot, proxyPath),
      stabilized_proxy: stabilizedProxy,
      contact_sheet: path.relative(outputRoot, contactPath),
      notes: path.relative(outputRoot, notesPath),
    },
    source_reference_exposed: false,
  };
  items.push(item);

  console.log([
    `EDITORIAL_ITEM=${sequence}`,
    `review=${result.review_task_id}`,
    `category=${classification.category}`,
    `duration=${technical.duration_seconds}`,
    `proxy=YES`,
    `contact=YES`,
    `stabilized=${stabilizedStatus}`,
  ].join("|"));
}

const categoryCounts = items.reduce((result, item) => {
  const category = item.editorial.category;
  result[category] = Number(result[category] || 0) + 1;
  return result;
}, {});

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_reserved_balance === after.wallet_reserved_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) {
  throw new Error("EDITORIAL_TRIAGE_CHANGED_PRODUCTION_STATE");
}

const manifest = {
  contract: PACKAGE_CONTRACT,
  created_at: new Date().toISOString(),
  completed: true,
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  audit_file: auditFile.absolute,
  audit_file_sha256: auditFile.file_sha256,
  output_root: outputRoot,
  item_count: items.length,
  category_counts: categoryCounts,
  items,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_reserved_balance: before.wallet_reserved_balance,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_reserved_balance: after.wallet_reserved_balance,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  review_reruns_executed: false,
  wallet_mutations_executed: false,
  source_regeneration_executed: false,
  production_task_status_changes_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
await fs.writeFile(
  path.join(outputRoot, "index.html"),
  packageHtml({ manifest }),
  "utf8",
);

console.log("============================================================");
console.log("FFMPEG EDITORIAL TRIAGE PACKAGE COMPLETE");
console.log("============================================================");
console.log(`OUTPUT_ROOT=${outputRoot}`);
console.log(`INDEX_HTML=${path.join(outputRoot, "index.html")}`);
console.log(`MANIFEST=${manifestPath}`);
console.log(`ITEM_COUNT=${items.length}`);
console.log(`CATEGORY_COUNTS=${JSON.stringify(categoryCounts)}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("REVIEW_RERUNS_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");
