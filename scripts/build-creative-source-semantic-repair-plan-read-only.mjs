#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function readJson(filePath, label) {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`${label}_FILE_NOT_FOUND:${absolute}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, raw, value: JSON.parse(raw) };
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assetKind(asset = {}) {
  const type = text(asset.asset_type).toUpperCase();
  const file = text(asset.file_name).toLowerCase();
  if (type.includes("VIDEO") || /\.(mp4|mov|m4v|webm|mkv|avi)$/.test(file)) {
    return "VIDEO";
  }
  if (type.includes("IMAGE") || type.includes("LOGO") || /\.(jpg|jpeg|png|webp|gif|avif|heic)$/.test(file)) {
    return "IMAGE";
  }
  return "UNSUPPORTED";
}

function sampleFractions(pipelineAudit = {}) {
  const configured = list(
    pipelineAudit.semantic_repair_policy?.video_sample_fractions ||
      pipelineAudit.source_semantic_policy?.video_sample_fractions,
  )
    .map((value) => finite(value))
    .filter((value) => value !== null && value >= 0 && value <= 1);

  const fractions = configured.length ? configured : [0.15, 0.5, 0.85];
  return [...new Set(fractions)].sort((left, right) => left - right);
}

const pipelineAudit = readJson(process.argv[2], "PIPELINE_AUDIT");
const costEstimate = readJson(process.argv[3], "COST_ESTIMATE");
const auditAssets = list(pipelineAudit.value.assets);
const service = list(costEstimate.value.services).find((entry) =>
  text(entry.service_id) === "ai.image.analyze",
);
const unitPrice = Number(service?.selected?.item_prices?.[0]?.customer_price || 0);
const provider = service?.selected?.provider || null;
const model = service?.selected?.model || null;
const pricingId = service?.selected?.pricing_id || null;
const currency = text(
  service?.selected?.currency ||
    costEstimate.value.currency,
).toUpperCase();

if (!provider || !model || !pricingId || !Number.isFinite(unitPrice) || unitPrice <= 0) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_PRICING_REQUIRED");
}
if (!currency) {
  throw new Error("SOURCE_SEMANTIC_REPAIR_CURRENCY_REQUIRED");
}

const videoSampleFractions = sampleFractions(pipelineAudit.value);
const imageAssets = auditAssets.filter((asset) => assetKind(asset) === "IMAGE");
const videoAssets = auditAssets.filter((asset) => assetKind(asset) === "VIDEO");
const unsupportedAssets = auditAssets.filter((asset) => assetKind(asset) === "UNSUPPORTED");
const videoSamplesPerAsset = videoSampleFractions.length;
const imageAnalysisCount = imageAssets.length;
const videoFrameAnalysisCount = videoAssets.length * videoSamplesPerAsset;
const totalAnalysisCount = imageAnalysisCount + videoFrameAnalysisCount;
const selectedBaseline = Number((totalAnalysisCount * unitPrice).toFixed(6));
const retryReserveCount = Math.max(
  0,
  Math.floor(finite(
    pipelineAudit.value.semantic_repair_policy?.retry_reserve_count ??
      pipelineAudit.value.source_semantic_policy?.retry_reserve_count,
    1,
  )),
);
const retryReserve = Number((unitPrice * retryReserveCount).toFixed(6));
const approvalCeiling = Number((selectedBaseline + retryReserve).toFixed(6));
const blockers = [];

if (pipelineAudit.value.readiness === "PASS") {
  blockers.push("PIPELINE_AUDIT_UNEXPECTEDLY_READY");
}
if (!auditAssets.length) blockers.push("SOURCE_ASSETS_REQUIRED");
if (!videoSampleFractions.length) blockers.push("VIDEO_SAMPLE_POLICY_REQUIRED");
if (unsupportedAssets.length) blockers.push("UNSUPPORTED_SOURCE_ASSETS_PRESENT");
if (!totalAnalysisCount) blockers.push("SEMANTIC_ANALYSIS_WORK_REQUIRED");

const workItems = [
  ...imageAssets.map((asset) => ({
    id: `image-analysis:${asset.asset_id}`,
    asset_id: asset.asset_id,
    file_name: asset.file_name,
    kind: "IMAGE_SEMANTIC_ANALYSIS",
    sample_index: 0,
    sample_fraction: null,
    service_id: "ai.image.analyze",
    provider,
    model,
    pricing_id: pricingId,
    customer_price: unitPrice,
  })),
  ...videoAssets.flatMap((asset) =>
    videoSampleFractions.map((fraction, index) => ({
      id: `video-frame-analysis:${asset.asset_id}:${index + 1}`,
      asset_id: asset.asset_id,
      file_name: asset.file_name,
      kind: "VIDEO_FRAME_SEMANTIC_ANALYSIS",
      sample_index: index,
      sample_fraction: fraction,
      service_id: "ai.image.analyze",
      provider,
      model,
      pricing_id: pricingId,
      customer_price: unitPrice,
    })),
  ),
];

const core = {
  contract: "CREATIVE_SOURCE_SEMANTIC_REPAIR_PLAN_V1",
  planning_mode: "DYNAMIC_SOURCE_EVIDENCE_PLAN",
  organization_id: pipelineAudit.value.organization_id,
  creative_project_id: pipelineAudit.value.creative_project_id,
  pipeline_audit_file: pipelineAudit.absolute,
  pipeline_audit_sha256: digest(pipelineAudit.raw),
  cost_estimate_file: costEstimate.absolute,
  cost_estimate_sha256: digest(costEstimate.raw),
  counts: {
    source_asset_count: auditAssets.length,
    image_asset_count: imageAssets.length,
    video_asset_count: videoAssets.length,
    unsupported_asset_count: unsupportedAssets.length,
    image_analysis_count: imageAnalysisCount,
    video_frame_analysis_count: videoFrameAnalysisCount,
    total_analysis_count: totalAnalysisCount,
    video_samples_per_asset: videoSamplesPerAsset,
  },
  pricing: {
    provider,
    model,
    pricing_id: pricingId,
    currency,
    customer_price_per_analysis: unitPrice,
    selected_baseline: selectedBaseline,
    retry_reserve_count: retryReserveCount,
    retry_reserve: retryReserve,
    approval_ceiling: approvalCeiling,
  },
  sampling_policy: {
    image: "ONE_FULL_IMAGE_ANALYSIS",
    video: "TEMPORALLY_DISTRIBUTED_FRAME_ANALYSIS",
    video_sample_fractions: videoSampleFractions,
    semantic_analysis_must_precede_story_generation: true,
    source_to_shot_evidence_gate_required: true,
  },
  universality: {
    fixed_asset_count_required: false,
    fixed_media_mix_required: false,
    fixed_analysis_count_required: false,
    fixed_currency_used: false,
    organization_specific_output_path_used: false,
  },
  work_items: workItems,
  blockers,
  readiness: blockers.length ? "FAIL" : "PASS",
  authorization: {
    provider_calls_authorized: false,
    usage_creation_authorized: false,
    wallet_reservation_authorized: false,
    wallet_charge_authorized: false,
    database_write_authorized: false,
    production_authorized: false,
    publication_authorized: false,
  },
};
const report = {
  ...core,
  plan_hash: crypto.createHash("sha256").update(JSON.stringify(core)).digest("hex"),
  generated_at: new Date().toISOString(),
};

const output = path.resolve(
  text(process.env.SOURCE_SEMANTIC_REPAIR_PLAN_OUTPUT) ||
    "/tmp/creative-source-semantic-repair-plan.json",
);
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE SOURCE SEMANTIC REPAIR PLAN");
console.log("============================================================");
console.log(`OUTPUT=${output}`);
console.log(`PLAN_HASH=${report.plan_hash}`);
console.log(`SOURCE_ASSET_COUNT=${report.counts.source_asset_count}`);
console.log(`IMAGE_ASSET_COUNT=${report.counts.image_asset_count}`);
console.log(`VIDEO_ASSET_COUNT=${report.counts.video_asset_count}`);
console.log(`UNSUPPORTED_ASSET_COUNT=${report.counts.unsupported_asset_count}`);
console.log(`IMAGE_ANALYSIS_COUNT=${report.counts.image_analysis_count}`);
console.log(`VIDEO_FRAME_ANALYSIS_COUNT=${report.counts.video_frame_analysis_count}`);
console.log(`TOTAL_ANALYSIS_COUNT=${report.counts.total_analysis_count}`);
console.log(`VIDEO_SAMPLE_FRACTIONS=${JSON.stringify(videoSampleFractions)}`);
console.log(`SELECTED_PROVIDER=${provider}`);
console.log(`SELECTED_MODEL=${model}`);
console.log(`CUSTOMER_PRICE_PER_ANALYSIS=${unitPrice}`);
console.log(`SELECTED_BASELINE=${selectedBaseline}`);
console.log(`RETRY_RESERVE_COUNT=${retryReserveCount}`);
console.log(`RETRY_RESERVE=${retryReserve}`);
console.log(`APPROVAL_CEILING=${approvalCeiling}`);
console.log(`CURRENCY=${currency}`);
console.log(`SOURCE_SEMANTIC_REPAIR_READINESS=${report.readiness}`);
console.log(`SOURCE_SEMANTIC_REPAIR_BLOCKER_COUNT=${blockers.length}`);
console.log(`SOURCE_SEMANTIC_REPAIR_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("USAGE_CREATED=NO");
console.log("WALLET_CHANGED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const item of workItems) {
  console.log([
    "SEMANTIC_REPAIR_ITEM",
    item.kind,
    item.asset_id,
    `file=${text(item.file_name).replaceAll("|", "/")}`,
    `sample=${item.sample_fraction ?? "FULL"}`,
    `provider=${item.provider}`,
    `model=${item.model}`,
    `price=${item.customer_price}`,
  ].join("|"));
}

if (blockers.length) process.exitCode = 2;
