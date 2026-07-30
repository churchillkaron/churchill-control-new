#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function requiredValue(...values) {
  for (const value of values) {
    const current = text(value);
    if (current) return current;
  }
  return null;
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}).toLowerCase();
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function originalFileName(item = {}) {
  return text(
    item.metadata?.original_file_name ||
    item.analysis?.storage_evidence?.original_file_name ||
    item.file_name,
  );
}

function storagePath(item = {}) {
  return text(
    item.storage_path ||
    item.metadata?.storage_path ||
    item.analysis?.storage_evidence?.storage_path,
  );
}

function bucketName(item = {}) {
  return text(
    item.storage_bucket ||
    item.bucket ||
    item.bucket_name ||
    item.metadata?.storage_bucket ||
    item.metadata?.bucket ||
    item.metadata?.bucket_name ||
    item.analysis?.storage_evidence?.bucket ||
    item.analysis?.storage_evidence?.bucket_name,
  );
}

function extension(item = {}, fallback = {}) {
  const source = [
    originalFileName(item),
    originalFileName(fallback),
    storagePath(item),
    storagePath(fallback),
    item.url,
    fallback.url,
    item.name,
    fallback.name,
  ].map(text).find(Boolean) || "";
  const clean = source.split("?")[0].split("#")[0];
  return clean.toLowerCase().match(/\.([a-z0-9]{2,6})$/)?.[1] || "";
}

const IMAGE_EXTENSIONS = new Set([
  "avif", "bmp", "gif", "heic", "heif", "jpeg", "jpg", "png", "svg",
  "tif", "tiff", "webp",
]);
const VIDEO_EXTENSIONS = new Set([
  "avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "webm",
]);
const AUDIO_EXTENSIONS = new Set([
  "aac", "aiff", "flac", "m4a", "mp3", "ogg", "opus", "wav", "wma",
]);

function mimeType(item = {}, fallback = {}) {
  return text(
    item.mime_type ||
    item.technical?.mime_type ||
    item.metadata?.mime_type ||
    item.analysis?.technical_inspection?.mime_type ||
    item.analysis?.storage_evidence?.mime_type ||
    fallback.mime_type ||
    fallback.technical?.mime_type ||
    fallback.metadata?.mime_type ||
    fallback.analysis?.technical_inspection?.mime_type ||
    fallback.analysis?.storage_evidence?.mime_type,
  ).toLowerCase();
}

function mediaKind(item = {}, fallback = {}) {
  const declared = text(
    item.media_kind ||
    item.technical?.media_kind ||
    item.metadata?.media_kind ||
    item.asset_type ||
    item.type ||
    fallback.media_kind ||
    fallback.technical?.media_kind ||
    fallback.metadata?.media_kind ||
    fallback.asset_type ||
    fallback.type,
  ).toUpperCase();

  if (["IMAGE", "PHOTO", "LOGO", "GRAPHIC"].includes(declared)) return "IMAGE";
  if (["VIDEO", "MOMENT", "CLIP"].includes(declared)) return "VIDEO";
  if (["AUDIO", "MUSIC", "SONG", "SOUNDTRACK"].includes(declared)) return "AUDIO";

  const mime = mimeType(item, fallback);
  if (mime.startsWith("image/")) return "IMAGE";
  if (mime.startsWith("video/")) return "VIDEO";
  if (mime.startsWith("audio/")) return "AUDIO";

  const ext = extension(item, fallback);
  if (IMAGE_EXTENSIONS.has(ext)) return "IMAGE";
  if (VIDEO_EXTENSIONS.has(ext)) return "VIDEO";
  if (AUDIO_EXTENSIONS.has(ext)) return "AUDIO";
  return "UNKNOWN";
}

function obviousCole(item = {}, fallback = {}) {
  const source = safeJson({ item, fallback });
  return [
    "cole ley", "cole-ley", "show me love", "andrey exx", "turaniqa",
    "cole-logo", "img_0013.mov", "img_0021.mov", "img_0023.mov",
    "img_0973.mov", "img_0974.mov", "img_0975.mov", "img_2622.mov",
    "img_2628.mov",
  ].some((term) => source.includes(term));
}

function likelyChurchill(item = {}, fallback = {}) {
  const source = safeJson({ item, fallback });
  return [
    "churchill", "karon", "pizza", "burger", "kebab", "pita",
    "garlic sauce", "pool table", "shuffleboard", "dart", "restaurant",
    "happy hour", "live music", "orange cc",
  ].some((term) => source.includes(term));
}

function assetIdentity(item = {}) {
  return text(item.creative_asset_id || item.id);
}

function recordScore(item = {}, fallback = {}) {
  let score = 0;
  if (likelyChurchill(item, fallback)) score += 100;
  if (obviousCole(item, fallback)) score -= 300;
  if (mediaKind(item, fallback) === "IMAGE") score += 20;
  if (mediaKind(item, fallback) === "VIDEO") score += 10;
  if (!item.parent_asset_node_id) score += 8;
  if (text(item.url)) score += 8;
  if (storagePath(item)) score += 6;
  if (item.review?.approved === true || fallback.review?.approved === true) score += 15;
  if (item.review?.human_reviewed === true || fallback.review?.human_reviewed === true) score += 8;
  return score;
}

async function allRows(client, table, organizationId, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function previewUrl(client, item, fallback = {}) {
  const direct = text(item.url || fallback.url);
  if (/^https?:\/\//i.test(direct)) return direct;

  const objectPath = storagePath(item) || storagePath(fallback);
  const bucket = bucketName(item) || bucketName(fallback);
  if (!objectPath || !bucket) return direct || null;

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(objectPath, 7200);
  if (error) return direct || null;
  return text(data?.signedUrl) || direct || null;
}

const organizationId = requiredValue(
  process.env.CHURCHILL_SMOKE_ORGANIZATION_ID,
  process.env.CREATIVE_SMOKE_ORGANIZATION_ID,
  "9550b843-b83c-4d15-b02d-a0b5ca23346e",
);
const supabaseUrl = requiredValue(
  process.env.SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
const serviceRoleKey = requiredValue(
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.SUPABASE_SERVICE_KEY,
);
if (!supabaseUrl) throw new Error("SUPABASE_URL required");
if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY required");

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: { transport: WebSocket },
});

const [assets, nodes] = await Promise.all([
  allRows(client, "creative_assets", organizationId),
  allRows(client, "creative_asset_nodes", organizationId),
]);
const assetById = new Map(assets.map((asset) => [text(asset.id), asset]));

const records = [
  ...assets.map((asset) => ({ ...asset, _source: "ASSET" })),
  ...nodes.map((node) => ({ ...node, _source: "NODE" })),
].filter((item) => {
  const fallback = assetById.get(text(item.creative_asset_id)) || {};
  return ["IMAGE", "VIDEO"].includes(mediaKind(item, fallback)) &&
    Boolean(text(item.url || fallback.url) || storagePath(item) || storagePath(fallback));
});

const representativeByAsset = new Map();
for (const item of records) {
  const id = assetIdentity(item);
  if (!id) continue;
  const fallback = assetById.get(id) || {};
  const current = representativeByAsset.get(id);
  if (!current || recordScore(item, fallback) > recordScore(current, fallback)) {
    representativeByAsset.set(id, item);
  }
}

const limit = Math.max(
  20,
  Math.min(300, Number(process.env.CHURCHILL_ASSET_SELECTOR_LIMIT || 180)),
);
const representatives = [...representativeByAsset.values()]
  .sort((left, right) => {
    const leftFallback = assetById.get(assetIdentity(left)) || {};
    const rightFallback = assetById.get(assetIdentity(right)) || {};
    return recordScore(right, rightFallback) - recordScore(left, leftFallback) ||
      text(right.created_at).localeCompare(text(left.created_at));
  })
  .slice(0, limit);

const candidates = [];
for (let index = 0; index < representatives.length; index += 1) {
  const item = representatives[index];
  const assetId = assetIdentity(item);
  const fallback = assetById.get(assetId) || {};
  candidates.push({
    code: `C${String(index + 1).padStart(3, "0")}`,
    asset_id: assetId,
    node_id: item._source === "NODE" ? text(item.id) || null : null,
    name: text(
      item.name || fallback.name || originalFileName(item) || originalFileName(fallback),
    ) || "Unnamed asset",
    original_file_name: originalFileName(item) || originalFileName(fallback) || null,
    media_kind: mediaKind(item, fallback),
    extension: extension(item, fallback) || null,
    preview_url: await previewUrl(client, item, fallback).catch(() => null),
    likely_churchill: likelyChurchill(item, fallback),
    obvious_cole: obviousCole(item, fallback),
    approved: item.review?.approved === true || fallback.review?.approved === true,
    creative_project_id: text(
      item.creative_project_id || fallback.metadata?.creative_project_id,
    ) || null,
  });
}

function mediaMarkup(candidate) {
  if (!candidate.preview_url) {
    return '<div class="unavailable">Preview unavailable</div>';
  }
  const url = escapeHtml(candidate.preview_url);
  if (candidate.media_kind === "VIDEO") {
    return `<video src="${url}" controls muted playsinline preload="metadata"></video>`;
  }
  return `<img src="${url}" loading="lazy" alt="${escapeHtml(candidate.name)}">`;
}

const cards = candidates.map((candidate) => {
  const flags = [
    candidate.likely_churchill ? '<span class="flag good">Churchill hint</span>' : "",
    candidate.obvious_cole ? '<span class="flag bad">Cole hint</span>' : "",
    candidate.approved ? '<span class="flag good">Approved</span>' : '<span class="flag warn">Needs approval</span>',
  ].filter(Boolean).join("");

  return `
  <article class="card" data-search="${escapeHtml(safeJson(candidate))}" data-kind="${candidate.media_kind}" data-cole="${candidate.obvious_cole}">
    <div class="preview">${mediaMarkup(candidate)}</div>
    <div class="body">
      <div class="code">${candidate.code}</div>
      <h2>${escapeHtml(candidate.name)}</h2>
      <div class="flags">${flags}</div>
      <dl>
        <dt>Asset ID</dt><dd>${escapeHtml(candidate.asset_id)}</dd>
        <dt>Node ID</dt><dd>${escapeHtml(candidate.node_id || "—")}</dd>
        <dt>File</dt><dd>${escapeHtml(candidate.original_file_name || "—")}</dd>
        <dt>Media</dt><dd>${escapeHtml(candidate.media_kind)} ${escapeHtml(candidate.extension || "")}</dd>
        <dt>Project</dt><dd>${escapeHtml(candidate.creative_project_id || "—")}</dd>
      </dl>
      <div class="roles">
        <label><input type="radio" name="logo" value="${escapeHtml(candidate.asset_id)}" data-code="${candidate.code}" data-kind="${candidate.media_kind}"> Logo</label>
        <label><input type="radio" name="food" value="${escapeHtml(candidate.asset_id)}" data-code="${candidate.code}" data-kind="${candidate.media_kind}"> Food</label>
        <label><input type="radio" name="experience" value="${escapeHtml(candidate.asset_id)}" data-code="${candidate.code}" data-kind="${candidate.media_kind}"> Experience</label>
      </div>
    </div>
  </article>`;
}).join("\n");

const outputPath = text(process.env.CHURCHILL_ASSET_SELECTOR_OUTPUT) || path.join(
  os.homedir(),
  "Downloads",
  `CHURCHILL_ASSET_SELECTOR_${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}.html`,
);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Churchill Asset Selector</title>
<style>
:root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#090909;color:#f5f5f5}*{box-sizing:border-box}body{margin:0;padding:24px;background:#090909}.toolbar{position:sticky;top:0;z-index:5;background:rgba(9,9,9,.96);padding:18px;border:1px solid #3d3224;border-radius:16px;margin-bottom:22px;backdrop-filter:blur(12px)}h1{margin:0 0 7px;font-size:24px}.subtitle{color:#bbb;margin:0 0 15px}.controls{display:flex;gap:10px;flex-wrap:wrap}.controls input[type=search]{min-width:280px;flex:1;padding:11px 13px;border-radius:10px;border:1px solid #555;background:#151515;color:#fff}.controls label{padding:9px 11px;border:1px solid #444;border-radius:10px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:18px}.card{border:1px solid #333;border-radius:16px;overflow:hidden;background:#111}.preview{height:250px;background:#050505;display:flex;align-items:center;justify-content:center}.preview img,.preview video{width:100%;height:100%;object-fit:contain}.unavailable{color:#777}.body{padding:14px}.code{color:#d6a66a;font-weight:800;letter-spacing:.08em}h2{font-size:16px;margin:7px 0 10px}.flags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.flag{font-size:11px;padding:4px 7px;border-radius:99px;border:1px solid}.good{color:#a9e6b0;border-color:#406744}.bad{color:#ffaaa2;border-color:#79423e}.warn{color:#f0d591;border-color:#75613c}dl{display:grid;grid-template-columns:70px 1fr;gap:5px 8px;font-size:11px;color:#bbb}dt{color:#777}dd{margin:0;overflow-wrap:anywhere}.roles{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:13px}.roles label{border:1px solid #4a4a4a;border-radius:9px;padding:9px 5px;text-align:center;cursor:pointer}.roles label:has(input:checked){border-color:#d6a66a;background:#2b2218;color:#fff}.result{margin-top:13px;background:#050505;border:1px solid #333;border-radius:10px;padding:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:#d8d8d8}.action{background:#d6a66a;color:#111;border:0;border-radius:9px;padding:10px 14px;font-weight:800;cursor:pointer}.hidden{display:none!important}
</style>
</head>
<body>
<section class="toolbar">
  <h1>Churchill Asset Selector</h1>
  <p class="subtitle">Read-only. Select the exact Churchill logo, food, and venue/game assets. Cole hints are deliberately flagged.</p>
  <div class="controls">
    <input id="search" type="search" placeholder="Search filename, ID, pizza, pool, logo...">
    <label><input id="hideCole" type="checkbox" checked> Hide Cole hints</label>
    <label><input id="imagesOnly" type="checkbox"> Images only</label>
    <button id="copy" class="action" type="button">Copy terminal exports</button>
  </div>
  <div id="result" class="result">Select one Logo, one Food, and one Experience asset.</div>
</section>
<main class="grid">${cards}</main>
<script>
const cards=[...document.querySelectorAll('.card')];
const search=document.getElementById('search');
const hideCole=document.getElementById('hideCole');
const imagesOnly=document.getElementById('imagesOnly');
const result=document.getElementById('result');
function filter(){const q=search.value.trim().toLowerCase();for(const card of cards){const searchOk=!q||card.dataset.search.includes(q);const coleOk=!hideCole.checked||card.dataset.cole!=='true';const kindOk=!imagesOnly.checked||card.dataset.kind==='IMAGE';card.classList.toggle('hidden',!(searchOk&&coleOk&&kindOk));}}
search.addEventListener('input',filter);hideCole.addEventListener('change',filter);imagesOnly.addEventListener('change',filter);filter();
function selected(name){return document.querySelector('input[name="'+name+'"]:checked');}
function exportsText(){const logo=selected('logo'),food=selected('food'),experience=selected('experience');if(!logo||!food||!experience)return null;if(new Set([logo.value,food.value,experience.value]).size!==3)return 'ERROR=SELECT_THREE_DISTINCT_ASSETS';if(logo.dataset.kind!=='IMAGE')return 'ERROR=LOGO_MUST_BE_IMAGE';return [
'export CHURCHILL_SMOKE_LOGO_ASSET_ID="'+logo.value+'"',
'export CHURCHILL_SMOKE_FOOD_ASSET_ID="'+food.value+'"',
'export CHURCHILL_SMOKE_EXPERIENCE_ASSET_ID="'+experience.value+'"',
'echo "SELECTED_LOGO='+logo.dataset.code+'"',
'echo "SELECTED_FOOD='+food.dataset.code+'"',
'echo "SELECTED_EXPERIENCE='+experience.dataset.code+'"'
].join('\n');}
for(const input of document.querySelectorAll('.roles input'))input.addEventListener('change',()=>{result.textContent=exportsText()||'Select one Logo, one Food, and one Experience asset.';});
document.getElementById('copy').addEventListener('click',async()=>{const value=exportsText();if(!value||value.startsWith('ERROR=')){result.textContent=value||'Select all three roles first.';return;}await navigator.clipboard.writeText(value);result.textContent=value+'\n\nCOPIED=YES';});
</script>
</body>
</html>`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, html, "utf8");

console.log("============================================================");
console.log("CHURCHILL VISUAL ASSET SELECTOR");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_ASSET_COUNT=${assets.length}`);
console.log(`CREATIVE_ASSET_NODE_COUNT=${nodes.length}`);
console.log(`VISUAL_ASSET_COUNT=${records.length}`);
console.log(`DISTINCT_VISUAL_ASSET_COUNT=${representativeByAsset.size}`);
console.log(`SELECTOR_CANDIDATE_COUNT=${candidates.length}`);
console.log(`LIKELY_CHURCHILL_HINT_COUNT=${candidates.filter((item) => item.likely_churchill).length}`);
console.log(`OBVIOUS_COLE_HINT_COUNT=${candidates.filter((item) => item.obvious_cole).length}`);
console.log("PROVIDER_CALLS_EXECUTED=0");
console.log("WALLET_CHARGES=0");
console.log("DATABASE_WRITES=0");
console.log("RUNWAY_CALLED=NO");
console.log("PRODUCTION_STARTED=NO");
console.log(`SELECTOR=${outputPath}`);
console.log("============================================================");
