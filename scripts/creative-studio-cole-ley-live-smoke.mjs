#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

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

function csv(value) {
  return text(value).split(",").map(text).filter(Boolean);
}

function headers(extra = {}) {
  const result = { accept: "application/json", ...extra };
  const cookie = env("CREATIVE_SMOKE_COOKIE");
  const bearer = env("CREATIVE_SMOKE_BEARER_TOKEN");
  if (cookie) result.cookie = cookie;
  if (bearer) result.authorization = `Bearer ${bearer}`;
  return result;
}

async function responsePayload(response) {
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok || payload.success === false) {
    throw new Error(
      `${response.url} failed (${response.status}): ${payload.error || payload.message || raw || response.statusText}`,
    );
  }
  return payload;
}

async function uploadAsset(baseUrl, organizationId, filePath, assetType) {
  const content = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const extension = path.extname(fileName).toLowerCase();
  const mimeType = extension === ".png"
    ? "image/png"
    : extension === ".jpg" || extension === ".jpeg"
      ? "image/jpeg"
      : extension === ".mov"
        ? "video/quicktime"
        : "video/mp4";
  const form = new FormData();
  form.set("organization_id", organizationId);
  form.set("asset_type", assetType);
  form.set("name", fileName);
  form.set("inspection_policy", JSON.stringify({
    require_complete_inspection: true,
    require_ffprobe: assetType === "video",
  }));
  form.set("file", new File([content], fileName, { type: mimeType }));

  const response = await fetch(new URL("/api/creative/assets/upload", baseUrl), {
    method: "POST",
    headers: headers(),
    body: form,
  });
  return responsePayload(response);
}

async function post(baseUrl, route, body) {
  const response = await fetch(new URL(route, baseUrl), {
    method: "POST",
    headers: headers({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  return responsePayload(response);
}

function missionIntent() {
  return [
    "Create a three-minute premium Cole Ley live-performance showreel from the selected real performance videos and logo.",
    "Every uploaded source video may contain multiple different songs. Detect song boundaries and treat each musical section as a separate candidate performance.",
    "Cole Ley is the primary subject. Never use a section unless Cole is clearly visible and actively performing. Do not accidentally centre another musician or an empty stage.",
    "Preserve the original live vocal and instrumental audio from each selected section with exact lip synchronisation.",
    "Choose longer musically complete phrases so a customer can genuinely hear Cole sing. Avoid random short clip rotation and avoid cutting only to show every source file.",
    "Build a deliberate three-act progression: immediate vocal hook, broad demonstration of repertoire and personality, then a strong final climax and branded booking ending.",
    "Create virtual multi-camera coverage from the real footage where quality permits: establishing view, medium performance shot, face-and-microphone close-up, emotional vocal close-up and restrained detail shots.",
    "Track Cole through every crop. Use smooth subject-aware virtual pushes, pull-backs, pans and reframing motivated by lyrics, vocal emphasis, drum accents, chord changes and applause.",
    "Do not use random zooms or constant movement. Do not enlarge beyond acceptable quality. Prefer another section or exclude footage when a clean Cole close-up is impossible.",
    "Do not use generic blurred duplicate backgrounds for vertical footage. Integrate strong vertical clips through intelligent landscape tracking, premium editorial framing, split-screen rhythm or a short intentional portrait feature. Exclude weak vertical footage.",
    "Normalise loudness between songs while preserving natural live dynamics and audience atmosphere. Use short musically sensible crossfades only where needed.",
    "Use the supplied Cole Ley logo with restrained premium typography. End with a clean booking call to action without covering Cole during key performance moments.",
    "The result must feel like a professionally directed artist showcase, not a compilation of uploaded phone clips.",
  ].join("\n\n");
}

async function main() {
  const baseUrl = required("CREATIVE_SMOKE_BASE_URL");
  const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
  const videoFiles = csv(required("COLE_LEY_VIDEO_FILES"));
  const logoFile = required("COLE_LEY_LOGO_FILE");
  const outputPath = env(
    "COLE_LEY_SMOKE_OUTPUT",
    `cole-ley-live-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );

  if (videoFiles.length < 2) {
    throw new Error("COLE_LEY_VIDEO_FILES must contain at least two files");
  }

  const report = {
    started_at: new Date().toISOString(),
    base_url: baseUrl,
    organization_id: organizationId,
    uploads: [],
  };

  for (const filePath of [...videoFiles, logoFile]) {
    const type = filePath === logoFile ? "logo" : "video";
    const uploaded = await uploadAsset(baseUrl, organizationId, filePath, type);
    report.uploads.push({ file: filePath, type, response: uploaded });
    console.log(`UPLOADED ${type.toUpperCase()}: ${path.basename(filePath)}`);
  }

  const selectedAssetIds = report.uploads
    .map((entry) => entry.response?.asset?.id)
    .filter(Boolean);
  if (selectedAssetIds.length !== report.uploads.length) {
    throw new Error("One or more uploads did not return a creative asset ID");
  }

  const creativeQualityPolicy = {
    version: "cole-ley-live-v1",
    minimum_scene_score: 88,
    regenerate_below_score: 82,
    require_brand_fit: true,
    require_non_ai_feel: true,
    require_identity_continuity: true,
    require_product_continuity: false,
    require_story_progression: true,
  };

  const semanticQualityPolicy = JSON.parse(required("CREATIVE_SMOKE_SEMANTIC_POLICY_JSON"));

  const created = await post(baseUrl, "/api/creative/create", {
    organization_id: organizationId,
    title: "Cole Ley — Three-Minute Live Performance Showreel",
    intent: missionIntent(),
    production_type: "MASTER_VIDEO",
    target_duration: 180,
    target_languages: ["en"],
    channels: ["website", "youtube", "facebook"],
    requested_outputs: ["landscape_master"],
    quality_profile: "world_class_live_artist_showreel",
    selected_asset_ids: selectedAssetIds,
    creative_quality_policy: creativeQualityPolicy,
    semantic_quality_policy: semanticQualityPolicy,
    audience: {
      primary: "event organisers, wedding planners, hotels, venues and private customers seeking a professional live singer",
    },
    desired_outcome: "Customers understand Cole Ley's vocal quality, repertoire, stage presence and suitability for premium live events.",
    communication_goal: "Demonstrate authentic live singing across several songs and moods while keeping Cole visibly central.",
    call_to_action: env("COLE_LEY_CALL_TO_ACTION", "Book Cole Ley for live events"),
    tone: "premium, authentic, warm, dynamic and musically intelligent",
    emotion: "confidence, connection, joy and memorable live atmosphere",
    metadata: {
      forensic_smoke_test: true,
      live_showreel: true,
      source_contains_multiple_songs_per_video: true,
      require_song_boundary_detection: true,
      require_subject_tracking: true,
      require_closeups: true,
      reject_static_compilation_edit: true,
      reject_blurred_vertical_background: true,
      original_audio_required: true,
      exact_lip_sync_required: true,
    },
  });

  report.create = created;
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log("\nCREATIVE MISSION STARTED");
  console.log(`MISSION_ID=${created.creative_mission_id || ""}`);
  console.log(`PROJECT_ID=${created.creative_project_id || ""}`);
  console.log(`STATUS=${created.status || ""}`);
  console.log(`REPORT=${outputPath}`);
}

main().catch(async (error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
