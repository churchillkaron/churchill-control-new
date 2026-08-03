#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function scalarId(value) {
  if (typeof value === "string" || typeof value === "number") {
    return text(value);
  }
  if (!value || typeof value !== "object") return "";
  const candidates = [
    value.asset_id,
    value.assetId,
    value.creative_asset_id,
    value.creativeAssetId,
    value.asset_node_id,
    value.assetNodeId,
    value.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" || typeof candidate === "number") {
      const resolved = text(candidate);
      if (resolved) return resolved;
    }
  }
  return "";
}

function directUrl(value) {
  if (typeof value === "string") {
    return /^https?:\/\//i.test(value) || value.startsWith("storage://")
      ? text(value)
      : "";
  }
  if (!value || typeof value !== "object") return "";
  return text(
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.audio_url ||
    value.audioUrl ||
    value.url,
  );
}

function selectedAssets(input = {}) {
  const assets = input.assets;
  if (Array.isArray(assets)) return assets;
  if (Array.isArray(assets?.selectedAssets)) return assets.selectedAssets;
  if (Array.isArray(input.source_assets)) return input.source_assets;
  if (Array.isArray(input.sourceAssets)) return input.sourceAssets;
  if (Array.isArray(input.selected_assets)) return input.selected_assets;
  if (Array.isArray(input.selectedAssets)) return input.selectedAssets;
  return [];
}

function identityLock(input = {}) {
  return object(
    input.identity_lock ||
    input.identityLock ||
    input.generation?.identity_lock ||
    input.generation?.identityLock,
  );
}

function collectIds(values = []) {
  const ids = [];
  for (const value of values.flat(Infinity)) {
    const id = scalarId(value);
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

function identityReferenceIds(lock = {}, input = {}) {
  return collectIds([
    lock.reference_asset_node_ids,
    lock.referenceAssetNodeIds,
    lock.identity_reference_asset_ids,
    lock.identityReferenceAssetIds,
    lock.reference_asset_node_id,
    lock.referenceAssetNodeId,
    input.identity_reference_asset_ids,
    input.identityReferenceAssetIds,
    input.requirements?.approved_identity_reference_node_ids,
    input.provider_parameters?.reference_asset_ids,
    input.generation?.provider_parameters?.reference_asset_ids,
  ]);
}

function summarizeCandidate(value, index) {
  return {
    index,
    kind: Array.isArray(value) ? "array" : typeof value,
    id: scalarId(value) || null,
    direct_url: directUrl(value) || null,
    keys:
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value).sort()
        : [],
  };
}

function safeUrl(value) {
  if (!value) return "NONE";
  if (!/^https?:\/\//i.test(value)) return value;
  const parsed = new URL(value);
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

const taskId = text(process.argv[2] || process.env.TASK_ID);
if (!taskId) throw new Error("TASK_ID_REQUIRED");

const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { resolveFirstCreativeProviderAssetUrl } = await import(
  "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl"
);

const task = await ProductionTaskRuntime.get(taskId);
if (!task) throw new Error(`TASK_NOT_FOUND:${taskId}`);

const input = object(task.input);
const generation = object(input.generation);
const lock = identityLock(input);
const referenceIds = identityReferenceIds(lock, input);
const identityCandidates = referenceIds.map((id) => ({
  id,
  asset_id: id,
  role: "IDENTITY_REFERENCE",
}));
const candidates = [
  input.identity_source,
  input.identitySource,
  input.prompt_image,
  input.promptImage,
  input.source,
  input.image,
  input.identity_reference_image,
  input.identityReferenceImage,
  identityCandidates,
  selectedAssets(input),
].flat(Infinity).filter((value) => value !== undefined && value !== null && value !== "");

const providerParameters = {
  ...object(generation.provider_parameters),
  ...object(input.provider_parameters),
  ...object(input.provider_options || input.providerOptions),
};
delete providerParameters.reference_asset_ids;
delete providerParameters.identity_profile_id;
delete providerParameters.requested_identity_angle;

let source = null;
let sourceError = null;
try {
  source = await resolveFirstCreativeProviderAssetUrl({
    organization_id: task.organization_id,
    values: [
      input.identity_source,
      input.identitySource,
      input.prompt_image,
      input.promptImage,
      input.source,
      input.image,
      input.identity_reference_image,
      input.identityReferenceImage,
      identityCandidates,
      selectedAssets(input),
    ],
  });
} catch (error) {
  sourceError = error?.message || String(error);
}

console.log("============================================================");
console.log("RUNWAY TASK DIAGNOSTIC");
console.log("============================================================");
console.log(`TASK_ID=${task.id}`);
console.log(`TITLE=${task.title || ""}`);
console.log(`STATUS=${task.status || ""}`);
console.log(`ERROR=${task.error || "NONE"}`);
console.log(`MODEL=${input.model || generation.model || "NONE"}`);
console.log(`DURATION=${input.duration_seconds ?? input.duration ?? input.output_spec?.duration_seconds ?? "NONE"}`);
console.log(`RATIO=${input.aspect_ratio ?? input.ratio ?? input.output_spec?.aspect_ratio ?? input.output_spec?.ratio ?? "NONE"}`);
console.log(`PROMPT_LENGTH=${text(input.prompt || input.promptText || input.instructions?.prompt || input.provider_prompt || generation.provider_prompt).length}`);
console.log(`IDENTITY_LOCK_REQUIRED=${lock.required === true ? "YES" : "NO"}`);
console.log(`IDENTITY_REFERENCE_IDS=${JSON.stringify(referenceIds)}`);
console.log(`PROVIDER_PARAMETER_KEYS=${JSON.stringify(Object.keys(providerParameters).sort())}`);
console.log(`PROVIDER_PARAMETERS=${JSON.stringify(providerParameters)}`);
console.log(`SOURCE_RESOLUTION_ERROR=${sourceError || "NONE"}`);
console.log(`SOURCE=${safeUrl(source)}`);
console.log(`SOURCE_CANDIDATES=${JSON.stringify(candidates.map(summarizeCandidate))}`);

if (source && /^https:\/\//i.test(source)) {
  try {
    const response = await fetch(source, {
      method: "HEAD",
      headers: { "User-Agent": "RunwayML API/1.0" },
      redirect: "manual",
    });
    console.log(`SOURCE_HEAD_STATUS=${response.status}`);
    console.log(`SOURCE_CONTENT_TYPE=${response.headers.get("content-type") || "MISSING"}`);
    console.log(`SOURCE_CONTENT_LENGTH=${response.headers.get("content-length") || "MISSING"}`);
    console.log(`SOURCE_REDIRECT=${response.headers.get("location") || "NONE"}`);
  } catch (error) {
    console.log(`SOURCE_HEAD_ERROR=${error?.message || String(error)}`);
  }
} else {
  console.log("SOURCE_HEAD_STATUS=NOT_TESTED");
}

console.log("PRODUCTION_RESTARTED=NO");
console.log("PROVIDER_REQUEST_SENT=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
