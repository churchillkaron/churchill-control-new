#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { openAsBlob } from "node:fs";

const TERMINAL_STATES = new Set([
  "READY_FOR_APPROVAL",
  "REVIEW_REQUIRED",
  "BLOCKED_BY_RELEASE_GATE",
  "BLOCKED_BY_PRODUCTION_FAILURE",
  "COMPLETED",
  "FAILED",
]);

function env(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function required(name) {
  const value = env(name);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function text(value) {
  return String(value ?? "").trim();
}

function number(name, fallback) {
  const parsed = Number(env(name, fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name, fallback = false) {
  const value = text(env(name, String(fallback))).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonEnv(name) {
  const raw = required(name);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${name} invalid JSON: ${error.message}`);
  }
  return parsed;
}

function headers(json = true) {
  const result = {};
  if (json) result["content-type"] = "application/json";
  const cookie = env("CREATIVE_SHOWREEL_COOKIE");
  const bearer = env("CREATIVE_SHOWREEL_BEARER_TOKEN");
  if (cookie) result.cookie = cookie;
  if (bearer) result.authorization = `Bearer ${bearer}`;
  const extra = env("CREATIVE_SHOWREEL_HEADERS_JSON");
  if (extra) Object.assign(result, JSON.parse(extra));
  return result;
}

async function parseResponse(response, label) {
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok || payload.success === false) {
    const message = payload.error || payload.message || raw || response.statusText;
    const error = new Error(`${label} failed (${response.status}): ${message}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function postJson(baseUrl, route, body) {
  const response = await fetch(new URL(route, baseUrl), {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body),
  });
  return parseResponse(response, route);
}

function mimeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".mov": "video/quicktime",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
  }[extension] || "application/octet-stream";
}

function normalizeSources(value) {
  if (!Array.isArray(value) || !value.length) {
    throw new Error("CREATIVE_SHOWREEL_SOURCE_FILES_JSON must be a non-empty array");
  }
  return value.map((entry, index) => {
    const item = typeof entry === "string" ? { path: entry } : entry || {};
    const filePath = text(item.path);
    if (!filePath) throw new Error(`Source ${index + 1} path required`);
    const extension = path.extname(filePath).toLowerCase();
    const inferredType = [".png", ".jpg", ".jpeg", ".webp"].includes(extension)
      ? "image"
      : [".mp3", ".m4a", ".wav"].includes(extension)
        ? "audio"
        : "video";
    return {
      path: filePath,
      name: text(item.name) || path.basename(filePath),
      asset_type: text(item.asset_type || item.assetType) || inferredType,
      inspection_policy: item.inspection_policy || item.inspectionPolicy || {},
    };
  });
}

async function uploadSource(baseUrl, organizationId, source) {
  const stat = await fs.stat(source.path);
  if (!stat.isFile()) throw new Error(`Source is not a file: ${source.path}`);

  const form = new FormData();
  form.set("organization_id", organizationId);
  form.set("asset_type", source.asset_type);
  form.set("name", source.name);
  form.set("inspection_policy", JSON.stringify(source.inspection_policy));
  const blob = await openAsBlob(source.path, { type: mimeFor(source.path) });
  form.set("file", blob, path.basename(source.path));

  const response = await fetch(new URL("/api/creative/assets/upload", baseUrl), {
    method: "POST",
    headers: headers(false),
    body: form,
  });
  const payload = await parseResponse(response, `/api/creative/assets/upload:${source.name}`);
  const asset = payload.asset || {};
  if (!asset.id) throw new Error(`Uploaded asset id missing for ${source.name}`);
  return {
    source,
    asset,
    asset_node: payload.asset_node || null,
    upload: payload.upload || null,
    inspection: payload.inspection || null,
    analysis_status: payload.analysis_status || asset.analysis?.status || null,
  };
}

function productionStatus(payload = {}) {
  return (
    payload.execution?.production?.post_production?.status ||
    payload.execution?.production?.status ||
    payload.production?.post_production?.status ||
    payload.production?.status ||
    payload.status ||
    null
  );
}

function defaultIntent(featuredSubject, durationSeconds) {
  return `Create an original ${durationSeconds}-second premium live-performance showreel centred on ${featuredSubject} using only the selected customer-owned source assets and their synchronized source audio.

Each source video may contain several different songs or performance chapters. Inspect the complete temporal content of every video, identify candidate song boundaries and coherent musical phrases, and score sections independently rather than treating each uploaded file as one scene. Build the final edit from the strongest coherent performance passages across the available songs, venues and camera positions.

The featured performer must remain the editorial priority. Use subject-aware reframing to create establishing shots, medium shots, close-ups, emotional vocal close-ups, instrument details and contextual band shots where source resolution permits. Track the featured performer through controlled crops, pans, push-ins, pull-backs and punch-ins. Every movement must be motivated by performance, phrasing or composition. Never enlarge beyond acceptable quality and never fabricate facial or lip movement.

Preserve exact lip sync and each chosen passage's own source audio. Do not place visible singing over unrelated audio. Cuts must respond to musical phrases, vocal emphasis, rhythm, applause and emotional progression. Prefer sustained, coherent passages over random rapid rotation between source files.

Vertical footage must not use generic blurred duplicate backgrounds. Resolve it through an intelligent landscape crop, a designed branded portrait composition, rhythmic multi-panel treatment, or exclusion when no premium treatment is possible. Keep final typography, logo and booking graphics outside generated pixels.

Deliver a clean 16:9 master with a short branded opening, escalating multi-song performance body, strong climax and restrained branded close. The final timeline must be exactly ${durationSeconds} seconds, with audio spanning the full timeline, no frozen tail, no missing final audio, no negative timestamps, constant delivery frame rate, and a final-frame decode check. Stop at READY_FOR_APPROVAL; do not publish automatically.`;
}

async function main() {
  const baseUrl = required("CREATIVE_SHOWREEL_BASE_URL");
  const organizationId = required("CREATIVE_SHOWREEL_ORGANIZATION_ID");
  const featuredSubject = required("CREATIVE_SHOWREEL_FEATURED_SUBJECT");
  const sources = normalizeSources(jsonEnv("CREATIVE_SHOWREEL_SOURCE_FILES_JSON"));
  const durationSeconds = number("CREATIVE_SHOWREEL_DURATION_SECONDS", 180);
  const pollIntervalMs = number("CREATIVE_SHOWREEL_POLL_INTERVAL_MS", 10000);
  const maxPolls = number("CREATIVE_SHOWREEL_MAX_POLLS", 90);
  const allowUnverified = bool("CREATIVE_SHOWREEL_ALLOW_UNVERIFIED_ASSETS", false);
  const outputPath = env(
    "CREATIVE_SHOWREEL_OUTPUT",
    `creative-source-showreel-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );

  const report = {
    started_at: new Date().toISOString(),
    base_url: baseUrl,
    organization_id: organizationId,
    featured_subject: featuredSubject,
    duration_seconds: durationSeconds,
    uploads: [],
    phases: [],
  };

  for (const source of sources) {
    process.stdout.write(`Uploading and analysing ${source.name}...\n`);
    const uploaded = await uploadSource(baseUrl, organizationId, source);
    report.uploads.push(uploaded);
    process.stdout.write(
      `Uploaded ${source.name}: ${uploaded.asset.id} (${uploaded.analysis_status || "UNKNOWN"})\n`,
    );
  }

  const unverified = report.uploads.filter((item) =>
    text(item.analysis_status).toUpperCase() !== "VERIFIED");
  if (unverified.length && !allowUnverified) {
    throw new Error(
      `CREATIVE_SOURCE_ASSET_ANALYSIS_REQUIRED:${unverified.map((item) => item.source.name).join(",")}`,
    );
  }

  const selectedAssetIds = report.uploads.map((item) => item.asset.id);
  const qualityPolicy = env("CREATIVE_SHOWREEL_QUALITY_POLICY_JSON")
    ? JSON.parse(env("CREATIVE_SHOWREEL_QUALITY_POLICY_JSON"))
    : {
        version: "showreel-v1",
        minimum_scene_score: 88,
        regenerate_below_score: 82,
        require_brand_fit: true,
        require_non_ai_feel: true,
        require_identity_continuity: true,
        require_product_continuity: false,
        require_story_progression: true,
      };
  const semanticPolicy = env("CREATIVE_SHOWREEL_SEMANTIC_POLICY_JSON")
    ? JSON.parse(env("CREATIVE_SHOWREEL_SEMANTIC_POLICY_JSON"))
    : {};
  const intent = env(
    "CREATIVE_SHOWREEL_INTENT",
    defaultIntent(featuredSubject, durationSeconds),
  );

  const created = await postJson(baseUrl, "/api/creative/create", {
    organization_id: organizationId,
    title: env("CREATIVE_SHOWREEL_TITLE", `${featuredSubject} live showreel`),
    intent,
    production_type: "LIVE_PERFORMANCE_SHOWREEL",
    target_duration: durationSeconds,
    target_languages: [env("CREATIVE_SHOWREEL_LANGUAGE", "en")],
    channels: ["MASTER_VIDEO"],
    requested_outputs: ["MASTER_VIDEO"],
    quality_profile: env("CREATIVE_SHOWREEL_QUALITY_PROFILE", "WORLD_CLASS_SOURCE_LED"),
    assets: selectedAssetIds,
    selected_asset_ids: selectedAssetIds,
    creative_quality_policy: qualityPolicy,
    semantic_quality_policy: semanticPolicy,
    metadata: {
      source_led_showreel_smoke: true,
      featured_subject: featuredSubject,
      exact_duration_seconds: durationSeconds,
      preserve_source_audio: true,
      require_song_boundary_detection: true,
      require_subject_aware_reframing: true,
      require_lip_sync: true,
      forbid_generic_vertical_blur: true,
      forbid_automatic_publication: true,
      source_file_names: sources.map((item) => item.name),
    },
  });
  report.phases.push({ phase: "create", response: created });
  report.creative_mission_id = created.creative_mission_id;
  report.creative_project_id = created.creative_project_id;
  report.creative_brief_id = created.creative_brief_id;

  if (!report.creative_mission_id || !report.creative_project_id) {
    throw new Error("Creative mission or project id missing");
  }

  let current = created;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const status = productionStatus(current);
    process.stdout.write(`Creative pipeline status: ${status || "UNKNOWN"}\n`);
    if (TERMINAL_STATES.has(status)) break;
    await sleep(pollIntervalMs);
    current = await postJson(baseUrl, "/api/creative/director/execute", {
      organization_id: organizationId,
      creative_mission_id: report.creative_mission_id,
      creative_project_id: report.creative_project_id,
      creative_brief_id: report.creative_brief_id,
    });
    report.phases.push({
      phase: "pipeline_resume",
      attempt: attempt + 1,
      status: productionStatus(current),
      response: current,
    });
  }

  report.final_status = productionStatus(current);
  report.final_response = current;
  report.finished_at = new Date().toISOString();
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Report: ${path.resolve(outputPath)}\n`);

  if (!["READY_FOR_APPROVAL", "REVIEW_REQUIRED", "COMPLETED"].includes(report.final_status)) {
    throw new Error(`CREATIVE_SHOWREEL_NOT_READY:${report.final_status || "UNKNOWN"}`);
  }
}

main().catch(async (error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
