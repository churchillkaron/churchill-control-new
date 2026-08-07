import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  ServiceExecutionRuntime,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  WalletRuntime,
} from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";
import {
  resolveProvider,
} from "@/lib/platform/service-runtime/providers/ProviderResolver";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import {
  resolvePrimaryExecutionCapability,
} from "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver";
import {
  creativeAssetNodeIntelligence,
  creativeAssetSemanticEvidence,
  assertCreativeSourceAssetsSemanticReady,
} from "@/lib/creative/assets/intelligence/CreativeAssetSemanticEvidenceRuntime";

const SERVICE_ID = "ai.image.analyze";
const REPAIR_CONTRACT = "CREATIVE_SOURCE_SEMANTIC_REPAIR_EXECUTION_V2";
const PLAN_CONTRACT = "CREATIVE_SOURCE_SEMANTIC_REPAIR_PLAN_V1";
const PLAN_MODE = "DYNAMIC_SOURCE_EVIDENCE_PLAN";

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

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function unique(values = []) {
  const output = [];
  const seen = new Set();
  for (const value of values.flat(Infinity)) {
    if (value === null || value === undefined || value === "") continue;
    const key = typeof value === "object"
      ? JSON.stringify(canonical(value))
      : text(value).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function parseJson(value) {
  if (value && typeof value === "object") return value;
  const source = text(value);
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (!fenced) return null;
    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }
}

function planCore(plan = {}) {
  const { plan_hash, generated_at, ...core } = plan;
  return core;
}

function planCurrency(plan = {}) {
  return text(plan.pricing?.currency).toUpperCase();
}

function planApprovalCeiling(plan = {}) {
  return money(plan.pricing?.approval_ceiling);
}

function retryReserveCount(plan = {}) {
  return Math.max(0, Math.floor(finite(plan.pricing?.retry_reserve_count, 0)));
}

export function sourceSemanticRepairApprovalLiteral(plan = {}) {
  const planHash = text(plan.plan_hash);
  const ceiling = planApprovalCeiling(plan);
  const currency = planCurrency(plan);
  if (!planHash || ceiling <= 0 || !currency) {
    throw new Error("SOURCE_SEMANTIC_REPAIR_APPROVAL_LITERAL_PLAN_INVALID");
  }
  return `APPROVE SOURCE SEMANTIC REPAIR PLAN ${planHash} MAX ${ceiling} ${currency}`;
}

function validatePlan(plan = {}, approval = {}) {
  const blockers = [];
  const workItems = list(plan.work_items);
  const expectedHash = digest(JSON.stringify(planCore(plan)));
  const expectedLiteral = sourceSemanticRepairApprovalLiteral(plan);
  const approvedMaximum = finite(approval.maximum_amount);
  const approvedCurrency = text(approval.currency).toUpperCase();
  const expectedMaximum = planApprovalCeiling(plan);
  const expectedCurrency = planCurrency(plan);
  const plannedCount = finite(plan.counts?.total_analysis_count);
  const imageItems = workItems.filter((item) => item.kind === "IMAGE_SEMANTIC_ANALYSIS");
  const videoItems = workItems.filter((item) => item.kind === "VIDEO_FRAME_SEMANTIC_ANALYSIS");
  const sampleFractions = list(plan.sampling_policy?.video_sample_fractions)
    .map((value) => finite(value))
    .filter((value) => value !== null);
  const unitPrice = money(plan.pricing?.customer_price_per_analysis);
  const reserveCount = retryReserveCount(plan);
  const expectedBaseline = money(workItems.length * unitPrice);
  const expectedReserve = money(reserveCount * unitPrice);
  const expectedCeiling = money(expectedBaseline + expectedReserve);

  if (plan.contract !== PLAN_CONTRACT) {
    blockers.push("REPAIR_PLAN_CONTRACT_INVALID");
  }
  if (plan.planning_mode !== PLAN_MODE) {
    blockers.push("REPAIR_PLAN_DYNAMIC_MODE_REQUIRED");
  }
  if (plan.readiness !== "PASS" || list(plan.blockers).length) {
    blockers.push("REPAIR_PLAN_NOT_READY");
  }
  if (text(plan.plan_hash) !== expectedHash) {
    blockers.push("REPAIR_PLAN_HASH_INVALID");
  }
  if (!text(approval.approved_at)) {
    blockers.push("EXPLICIT_APPROVAL_TIMESTAMP_REQUIRED");
  }
  if (text(approval.literal) !== expectedLiteral) {
    blockers.push("EXPLICIT_APPROVAL_LITERAL_INVALID");
  }
  if (approvedMaximum === null || money(approvedMaximum) !== expectedMaximum) {
    blockers.push("EXPLICIT_APPROVAL_MAXIMUM_INVALID");
  }
  if (!approvedCurrency || approvedCurrency !== expectedCurrency) {
    blockers.push("EXPLICIT_APPROVAL_CURRENCY_INVALID");
  }
  if (!expectedCurrency) {
    blockers.push("REPAIR_PLAN_CURRENCY_REQUIRED");
  }
  if (!workItems.length || plannedCount !== workItems.length) {
    blockers.push("REPAIR_PLAN_WORK_ITEM_COUNT_INVALID");
  }
  if (finite(plan.counts?.image_analysis_count) !== imageItems.length) {
    blockers.push("REPAIR_PLAN_IMAGE_ANALYSIS_COUNT_INVALID");
  }
  if (finite(plan.counts?.video_frame_analysis_count) !== videoItems.length) {
    blockers.push("REPAIR_PLAN_VIDEO_ANALYSIS_COUNT_INVALID");
  }
  if (finite(plan.counts?.video_samples_per_asset) !== sampleFractions.length) {
    blockers.push("REPAIR_PLAN_VIDEO_SAMPLE_POLICY_INVALID");
  }
  if (!unitPrice || unitPrice <= 0) {
    blockers.push("REPAIR_PLAN_UNIT_PRICE_INVALID");
  }
  if (money(plan.pricing?.selected_baseline) !== expectedBaseline) {
    blockers.push("REPAIR_PLAN_BASELINE_INVALID");
  }
  if (money(plan.pricing?.retry_reserve) !== expectedReserve) {
    blockers.push("REPAIR_PLAN_RETRY_RESERVE_INVALID");
  }
  if (expectedMaximum !== expectedCeiling) {
    blockers.push("REPAIR_PLAN_APPROVAL_CEILING_INVALID");
  }
  for (const item of workItems) {
    if (text(item.service_id) !== SERVICE_ID) {
      blockers.push(`REPAIR_PLAN_SERVICE_INVALID:${item.id}`);
    }
    if (text(item.provider) !== text(plan.pricing?.provider)) {
      blockers.push(`REPAIR_PLAN_PROVIDER_INVALID:${item.id}`);
    }
    if (text(item.model) !== text(plan.pricing?.model)) {
      blockers.push(`REPAIR_PLAN_MODEL_INVALID:${item.id}`);
    }
    if (text(item.pricing_id) !== text(plan.pricing?.pricing_id)) {
      blockers.push(`REPAIR_PLAN_PRICING_INVALID:${item.id}`);
    }
    if (money(item.customer_price) !== unitPrice) {
      blockers.push(`REPAIR_PLAN_ITEM_PRICE_INVALID:${item.id}`);
    }
    if (!["IMAGE_SEMANTIC_ANALYSIS", "VIDEO_FRAME_SEMANTIC_ANALYSIS"].includes(item.kind)) {
      blockers.push(`REPAIR_PLAN_ITEM_KIND_INVALID:${item.id}`);
    }
  }
  for (const authorizationKey of [
    "provider_calls_authorized",
    "usage_creation_authorized",
    "wallet_reservation_authorized",
    "wallet_charge_authorized",
    "database_write_authorized",
    "production_authorized",
    "publication_authorized",
  ]) {
    if (plan.authorization?.[authorizationKey] !== false) {
      blockers.push(`REPAIR_PLAN_AUTHORIZATION_MUST_REMAIN_FALSE:${authorizationKey}`);
    }
  }
  if (blockers.length) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_APPROVAL_BLOCKED:${unique(blockers).join(",")}`);
  }

  return {
    contract: "CREATIVE_SOURCE_SEMANTIC_REPAIR_APPROVAL_V2",
    literal: approval.literal,
    maximum_amount: money(approvedMaximum),
    currency: approvedCurrency,
    approved_at: approval.approved_at,
    plan_hash: plan.plan_hash,
  };
}

function providerInstruction({ item, asset }) {
  return `
You are Avantiqo's forensic source-asset intelligence examiner.
Inspect only what is visibly evidenced in this single image. This image is
${item.kind === "VIDEO_FRAME_SEMANTIC_ANALYSIS"
  ? `a sampled frame at ${Math.round(Number(item.sample_fraction) * 100)}% of a source video`
  : "the complete source image"}.

Do not infer any entity, attribute, action, relationship, environment, identity,
role, context, business meaning, temporal state, rights, consent, intent, or use
unless it is visibly supported by this image. Do not use filenames, asset names,
external descriptions, or surrounding business context as visual evidence.
Report uncertainty explicitly.

Return strict JSON only:
{
  "status":"VERIFIED|UNVERIFIED",
  "media_kind":"image",
  "scene_type":"neutral visible classification",
  "description":"precise description of visible evidence",
  "summary":"short visible-evidence summary",
  "tags":[],
  "visible_subjects":[{"id":"subject-1","description":"","position":"","confidence":0}],
  "objects":[{"id":"object-1","description":"","position":"","confidence":0}],
  "activities":[{"description":"","confidence":0}],
  "environments":[{"description":"","confidence":0}],
  "visible_text":[{"text":"","position":"","confidence":0}],
  "logos":[{"description":"","visible_text":"","position":"","confidence":0}],
  "continuity_anchors":[{"type":"","description":"","position":"","confidence":0}],
  "continuity_risks":[],
  "technical_quality":{"resolution":"","sharpness":"","noise":"","compression":"","exposure":"","colour":""},
  "crop_guidance":{"landscape":"","portrait":"","square":""},
  "safe_areas":{"critical_subjects":[],"critical_text":[]},
  "direct_use_disposition":"DIRECT_USE|REFERENCE_ONLY|REPAIR_FIRST|EXCLUDE",
  "disposition_reason":"evidence-based production decision",
  "recommended_uses":[],
  "incompatible_uses":[],
  "repairability":{"possible":false,"operations":[],"limits":[]},
  "rights_risks":[],
  "consent_risks":[],
  "privacy_risks":[],
  "claims_risks":[],
  "brand_risks":[],
  "evidence":[{"observation":"","position":"","confidence":0}],
  "asset_confidence":0
}

Rules:
- VERIFIED means the image was actually inspected, not that every visible detail is known.
- Include only visible evidence. Empty arrays are correct when evidence is absent.
- Do not assign a functional meaning, role, relationship, or identity from appearance alone.
- Sparse sampled frames do not prove motion, events, or continuity between frames.
- Confidence is evidence confidence from 0 to 100.

ASSET RECORD CONTEXT (not visual evidence):
${JSON.stringify({
  asset_id: asset.id,
  asset_type: asset.asset_type,
  sample_fraction: item.sample_fraction,
  sample_index: item.sample_index,
})}
`;
}

function unverifiedAnalysis(reason) {
  return {
    status: "UNVERIFIED",
    verification_reason: text(reason) || "Semantic analysis unavailable",
    media_kind: "image",
    scene_type: "unknown",
    description: "",
    summary: "",
    tags: [],
    visible_subjects: [],
    objects: [],
    activities: [],
    environments: [],
    visible_text: [],
    logos: [],
    continuity_anchors: [],
    continuity_risks: [],
    technical_quality: {},
    crop_guidance: {},
    safe_areas: {},
    direct_use_disposition: "REFERENCE_ONLY",
    disposition_reason: "Semantic understanding is unverified",
    recommended_uses: [],
    incompatible_uses: [],
    repairability: {},
    rights_risks: [],
    consent_risks: [],
    privacy_risks: [],
    claims_risks: [],
    brand_risks: [],
    evidence: [],
    asset_confidence: 0,
  };
}

function normalizeAnalysis(parsed, item) {
  const result = object(parsed?.result || parsed);
  const confidence = finite(result.asset_confidence, 0);
  const normalized = {
    ...unverifiedAnalysis("Provider output did not qualify"),
    ...result,
    status: text(result.status).toUpperCase() === "VERIFIED"
      ? "VERIFIED"
      : "UNVERIFIED",
    media_kind: "image",
    tags: list(result.tags),
    visible_subjects: list(result.visible_subjects),
    objects: list(result.objects),
    activities: list(result.activities),
    environments: list(result.environments),
    visible_text: list(result.visible_text),
    logos: list(result.logos),
    continuity_anchors: list(result.continuity_anchors),
    continuity_risks: list(result.continuity_risks),
    recommended_uses: list(result.recommended_uses),
    incompatible_uses: list(result.incompatible_uses),
    rights_risks: list(result.rights_risks),
    consent_risks: list(result.consent_risks),
    privacy_risks: list(result.privacy_risks),
    claims_risks: list(result.claims_risks),
    brand_risks: list(result.brand_risks),
    evidence: list(result.evidence),
    asset_confidence: Math.max(0, Math.min(100, confidence || 0)),
    semantic_sample: {
      kind: item.kind,
      sample_index: item.sample_index,
      sample_fraction: item.sample_fraction,
    },
  };
  const evidence = creativeAssetSemanticEvidence({ analysis: normalized });
  if (!evidence.verified) {
    return {
      ...normalized,
      status: "UNVERIFIED",
      verification_reason:
        normalized.verification_reason ||
        `Provider result lacked verified semantic evidence (${evidence.evidence_count})`,
    };
  }
  return normalized;
}

function executionPayload(execution = {}) {
  const raw = execution.output;
  const candidates = [
    raw?.output?.output,
    raw?.output?.text,
    raw?.output,
    raw?.text,
    raw?.result,
    raw,
  ];
  for (const candidate of candidates) {
    const parsed = parseJson(candidate);
    if (parsed) return parsed;
  }
  return null;
}

async function selectedPreflight(plan, organizationId) {
  const serviceCapabilities = resolveServiceCapabilities(SERVICE_ID);
  const executionCapability = resolvePrimaryExecutionCapability(
    serviceCapabilities?.capabilities || [],
  );
  if (!executionCapability) {
    throw new Error("SOURCE_SEMANTIC_REPAIR_CAPABILITY_UNAVAILABLE");
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability: executionCapability,
    preferredProvider: plan.pricing.provider,
    policy: {},
  });
  const pricing = await PricingRuntime.resolve({
    provider: selected.provider,
    model: selected.model,
    capability: executionCapability,
    currency: plan.pricing.currency,
  });

  const blockers = [];
  if (text(selected.provider) !== text(plan.pricing.provider)) {
    blockers.push(`PROVIDER_DRIFT:${selected.provider}:${plan.pricing.provider}`);
  }
  if (text(selected.model) !== text(plan.pricing.model)) {
    blockers.push(`MODEL_DRIFT:${selected.model}:${plan.pricing.model}`);
  }
  if (text(pricing.pricing_id) !== text(plan.pricing.pricing_id)) {
    blockers.push(`PRICING_ID_DRIFT:${pricing.pricing_id}:${plan.pricing.pricing_id}`);
  }
  if (money(pricing.customer_price) !== money(plan.pricing.customer_price_per_analysis)) {
    blockers.push(`UNIT_PRICE_DRIFT:${pricing.customer_price}:${plan.pricing.customer_price_per_analysis}`);
  }
  if (text(pricing.currency).toUpperCase() !== planCurrency(plan)) {
    blockers.push(`CURRENCY_DRIFT:${pricing.currency}:${plan.pricing.currency}`);
  }
  if (blockers.length) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_PREFLIGHT_BLOCKED:${blockers.join(",")}`);
  }

  return {
    execution_capability: executionCapability,
    provider: selected.provider,
    model: selected.model,
    credential_id: selected.credential_id || null,
    pricing,
  };
}

async function existingUsages(organizationId, planHash) {
  const { data, error } = await supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("metadata->>source_semantic_repair_plan_hash", planHash)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

function usageByItem(usages = []) {
  const result = new Map();
  for (const usage of usages) {
    const itemId = text(usage.metadata?.source_semantic_repair_item_id);
    if (!itemId) continue;
    if (!result.has(itemId)) result.set(itemId, []);
    result.get(itemId).push(usage);
  }
  return result;
}

function usageAnalysis(usage, item) {
  const result = usage?.metadata?.result;
  const parsed = executionPayload({ output: result });
  return parsed ? normalizeAnalysis(parsed, item) : null;
}

async function signedAssetUrl(asset) {
  const bucket = text(
    asset.metadata?.storage_bucket ||
      asset.analysis?.storage_evidence?.bucket,
  );
  const storagePath = text(
    asset.metadata?.storage_path ||
      asset.analysis?.storage_evidence?.path ||
      asset.analysis?.storage_evidence?.storage_path,
  );
  if (bucket && storagePath) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  const direct = text(
    asset.file_url || asset.image_url || asset.thumbnail_url,
  );
  if (!direct) throw new Error(`SOURCE_ASSET_URL_REQUIRED:${asset.id}`);
  return direct;
}

async function downloadFile(url, target) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`SOURCE_ASSET_DOWNLOAD_FAILED:${response.status}:${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target));
  return target;
}

function runBinary(binary, args, label) {
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label}_FAILED:${text(result.stderr) || result.status}`);
  }
  return result.stdout;
}

function videoDuration(asset, filePath) {
  const known = finite(
    asset.analysis?.technical_inspection?.duration_seconds ??
      asset.analysis?.duration_seconds ??
      asset.metadata?.duration_seconds,
  );
  if (known && known > 0) return known;
  const output = runBinary(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    "FFPROBE",
  );
  const duration = finite(text(output));
  if (!duration || duration <= 0) {
    throw new Error(`SOURCE_VIDEO_DURATION_REQUIRED:${asset.id}`);
  }
  return duration;
}

function extractVideoFrame({ input, output, duration, fraction }) {
  const second = Math.max(0, Math.min(duration - 0.05, duration * Number(fraction)));
  runBinary(
    "ffmpeg",
    [
      "-y",
      "-loglevel", "error",
      "-ss", String(second),
      "-i", input,
      "-frames:v", "1",
      "-vf", "scale='min(1600,iw)':-2",
      "-q:v", "2",
      output,
    ],
    "FFMPEG_FRAME_EXTRACTION",
  );
  if (!fs.existsSync(output) || fs.statSync(output).size <= 0) {
    throw new Error(`SOURCE_VIDEO_FRAME_EMPTY:${output}`);
  }
  return { output, second };
}

function imageDataUrl(filePath) {
  return `data:image/jpeg;base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function existingRepairItems(asset = {}, planHash) {
  const repair = object(asset.analysis?.semantic_repair);
  if (text(repair.plan_hash) !== text(planHash)) return {};
  return object(repair.items);
}

function itemRecord({ item, analysis, execution = null, recovered = false }) {
  return {
    contract: "CREATIVE_SOURCE_SEMANTIC_REPAIR_ITEM_V2",
    item_id: item.id,
    kind: item.kind,
    sample_index: item.sample_index,
    sample_fraction: item.sample_fraction,
    provider: execution?.provider || item.provider,
    model: execution?.model || item.model,
    pricing_id:
      execution?.pricing?.pricing_id ||
      execution?.reservation_pricing?.pricing_id ||
      item.pricing_id,
    customer_price: money(execution?.pricing?.customer_price || item.customer_price || 0),
    usage_id: execution?.usage?.id || null,
    recovered_from_usage: recovered,
    analysis,
    completed_at: new Date().toISOString(),
  };
}

function aggregateVideoAnalysis(asset, items, planHash, assetWorkItems) {
  const expectedItems = list(assetWorkItems)
    .filter((item) => item.kind === "VIDEO_FRAME_SEMANTIC_ANALYSIS")
    .sort((left, right) => Number(left.sample_index) - Number(right.sample_index));
  const ordered = Object.values(items)
    .filter((item) => item.kind === "VIDEO_FRAME_SEMANTIC_ANALYSIS")
    .sort((left, right) => Number(left.sample_index) - Number(right.sample_index));
  if (!expectedItems.length || ordered.length !== expectedItems.length) {
    throw new Error(
      `SOURCE_VIDEO_SAMPLE_COUNT_INVALID:${asset.id}:${ordered.length}:${expectedItems.length}`,
    );
  }
  const expectedFractions = expectedItems.map((item) => finite(item.sample_fraction));
  const actualFractions = ordered.map((item) => finite(item.sample_fraction));
  if (JSON.stringify(actualFractions) !== JSON.stringify(expectedFractions)) {
    throw new Error(`SOURCE_VIDEO_SAMPLE_POLICY_DRIFT:${asset.id}`);
  }

  const analyses = ordered.map((item) => object(item.analysis));
  const allVerified = analyses.every((analysis) =>
    creativeAssetSemanticEvidence({ analysis }).verified,
  );
  const confidences = analyses
    .map((analysis) => finite(analysis.asset_confidence, 0))
    .filter((value) => value !== null);
  const descriptions = analyses.map((analysis, index) => ({
    sample_fraction: ordered[index].sample_fraction,
    description: text(analysis.description),
  }));
  const percentages = actualFractions.map((fraction) =>
    `${Math.round(Number(fraction) * 100)}%`,
  );

  return {
    ...object(asset.analysis),
    status: allVerified ? "VERIFIED" : "UNVERIFIED",
    verification_reason: allVerified
      ? `${ordered.length} planned source-video frames were inspected`
      : "One or more planned source-video samples lacked verified evidence",
    media_kind: "video",
    scene_type: unique(analyses.map((analysis) => analysis.scene_type)).join(" / ") || "video",
    description: descriptions
      .map((entry) => `${Math.round(Number(entry.sample_fraction) * 100)}%: ${entry.description}`)
      .join(" | "),
    summary: `Sparse temporal source evidence from planned frame samples at ${percentages.join(", ")}.`,
    tags: unique(analyses.map((analysis) => analysis.tags)),
    visible_subjects: unique(analyses.map((analysis) => analysis.visible_subjects)),
    objects: unique(analyses.map((analysis) => analysis.objects)),
    activities: unique(analyses.map((analysis) => analysis.activities)),
    environments: unique(analyses.map((analysis) => analysis.environments)),
    visible_text: unique(analyses.map((analysis) => analysis.visible_text)),
    logos: unique(analyses.map((analysis) => analysis.logos)),
    continuity_anchors: unique(analyses.map((analysis) => analysis.continuity_anchors)),
    continuity_risks: unique([
      analyses.map((analysis) => analysis.continuity_risks),
      "Sparse frame sampling does not prove motion or events between samples",
    ]),
    recommended_uses: unique(analyses.map((analysis) => analysis.recommended_uses)),
    incompatible_uses: unique([
      analyses.map((analysis) => analysis.incompatible_uses),
      "Do not infer unseen temporal states between sampled frames",
    ]),
    rights_risks: unique(analyses.map((analysis) => analysis.rights_risks)),
    consent_risks: unique(analyses.map((analysis) => analysis.consent_risks)),
    privacy_risks: unique(analyses.map((analysis) => analysis.privacy_risks)),
    claims_risks: unique(analyses.map((analysis) => analysis.claims_risks)),
    brand_risks: unique(analyses.map((analysis) => analysis.brand_risks)),
    evidence: unique(analyses.map((analysis) => analysis.evidence)),
    asset_confidence: confidences.length
      ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
      : 0,
    direct_use_disposition: "REFERENCE_ONLY",
    disposition_reason: "Video was semantically sampled for source understanding; sparse frames are not a full temporal quality review.",
    motion_characteristics: {
      status: "NOT_INFERRED_FROM_SPARSE_FRAMES",
      sample_fractions: actualFractions,
    },
    frame_samples: ordered.map((item) => ({
      item_id: item.item_id,
      sample_index: item.sample_index,
      sample_fraction: item.sample_fraction,
      usage_id: item.usage_id,
      analysis: item.analysis,
    })),
    semantic_repair: {
      contract: REPAIR_CONTRACT,
      plan_hash: planHash,
      media_kind: "video",
      items,
      completed: allVerified,
      completed_at: new Date().toISOString(),
    },
  };
}

function aggregateImageAnalysis(asset, items, planHash) {
  const record = Object.values(items)
    .find((item) => item.kind === "IMAGE_SEMANTIC_ANALYSIS");
  if (!record) throw new Error(`SOURCE_IMAGE_ANALYSIS_MISSING:${asset.id}`);
  const analysis = object(record.analysis);
  return {
    ...object(asset.analysis),
    ...analysis,
    media_kind: "image",
    semantic_repair: {
      contract: REPAIR_CONTRACT,
      plan_hash: planHash,
      media_kind: "image",
      items,
      completed: creativeAssetSemanticEvidence({ analysis }).verified,
      completed_at: new Date().toISOString(),
    },
  };
}

async function persistAssetAnalysis({ asset, finalAnalysis, plan, approval }) {
  const semantic = creativeAssetSemanticEvidence({ analysis: finalAnalysis });
  if (!semantic.verified) {
    throw new Error(
      `SOURCE_ASSET_FINAL_SEMANTIC_EVIDENCE_INVALID:${asset.id}:${semantic.status}:${semantic.evidence_count}`,
    );
  }

  const metadata = {
    ...object(asset.metadata),
    analysis_status: "VERIFIED",
    semantic_analysis_status: "VERIFIED",
    semantic_evidence_count: semantic.evidence_count,
    semantic_repair_contract: REPAIR_CONTRACT,
    semantic_repair_plan_hash: plan.plan_hash,
    semantic_repair_approval_maximum_amount: approval.maximum_amount,
    semantic_repair_approval_currency: approval.currency,
    semantic_repair_completed_at: new Date().toISOString(),
  };

  const { data: updated, error } = await supabaseAdmin
    .from("creative_assets")
    .update({
      analysis: finalAnalysis,
      description: semantic.fields.description,
      tags: semantic.fields.tags,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id)
    .eq("organization_id", plan.organization_id)
    .select()
    .single();
  if (error) throw error;

  const { data: nodes, error: nodeError } = await supabaseAdmin
    .from("creative_asset_nodes")
    .select("*")
    .eq("organization_id", plan.organization_id)
    .eq("creative_asset_id", asset.id)
    .neq("status", "ARCHIVED");
  if (nodeError) throw nodeError;

  for (const node of nodes || []) {
    const intelligence = {
      ...object(node.intelligence),
      ...creativeAssetNodeIntelligence(finalAnalysis, asset.score),
      verified: true,
    };
    const review = {
      ...object(node.review),
      ai_reviewed: true,
      notes: text(node.review?.notes) ||
        "Source semantic evidence repaired through governed visual analysis.",
    };
    const nodeMetadata = {
      ...object(node.metadata),
      analysis_status: "VERIFIED",
      semantic_analysis_status: "VERIFIED",
      semantic_evidence_count: semantic.evidence_count,
      semantic_repair_plan_hash: plan.plan_hash,
      semantic_repair_completed_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabaseAdmin
      .from("creative_asset_nodes")
      .update({
        description: semantic.fields.description,
        intelligence,
        review,
        metadata: nodeMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);
    if (updateError) throw updateError;
  }

  return updated;
}

async function persistItemProgress({ asset, items, plan, approval }) {
  const analysis = {
    ...object(asset.analysis),
    semantic_repair: {
      contract: REPAIR_CONTRACT,
      plan_hash: plan.plan_hash,
      media_kind: Object.values(items).some((item) =>
        item.kind === "VIDEO_FRAME_SEMANTIC_ANALYSIS",
      ) ? "video" : "image",
      items,
      completed: false,
      approval_maximum_amount: approval.maximum_amount,
      approval_currency: approval.currency,
      updated_at: new Date().toISOString(),
    },
  };
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .update({
      analysis,
      metadata: {
        ...object(asset.metadata),
        semantic_repair_contract: REPAIR_CONTRACT,
        semantic_repair_plan_hash: plan.plan_hash,
        semantic_repair_in_progress: true,
        semantic_repair_updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id)
    .eq("organization_id", plan.organization_id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function executeItem({ item, asset, image, plan, approval, attempt }) {
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: plan.organization_id,
    service_id: SERVICE_ID,
    provider_id: plan.pricing.provider,
    input: {
      prompt: providerInstruction({ item, asset }),
      image,
      quantity: 1,
    },
    metadata: {
      module: "CREATIVE",
      operation: "SOURCE_SEMANTIC_REPAIR_V2",
      source_semantic_repair_contract: REPAIR_CONTRACT,
      source_semantic_repair_plan_hash: plan.plan_hash,
      source_semantic_repair_item_id: item.id,
      source_asset_id: asset.id,
      source_asset_kind: item.kind,
      source_sample_index: item.sample_index,
      source_sample_fraction: item.sample_fraction,
      source_semantic_repair_attempt: attempt,
      approved_maximum_amount: approval.maximum_amount,
      approved_currency: approval.currency,
      production_authorized: false,
      publication_authorized: false,
    },
    category: "CREATIVE_SOURCE_SEMANTIC_REPAIR",
    provider_policy: {
      allowed_providers: [plan.pricing.provider],
    },
  });

  if (execution.pending) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_PENDING_NOT_SUPPORTED:${item.id}`);
  }
  if (text(execution.provider) !== text(plan.pricing.provider)) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_PROVIDER_DRIFT:${execution.provider}`);
  }
  if (text(execution.model) !== text(plan.pricing.model)) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_MODEL_DRIFT:${execution.model}`);
  }
  if (money(execution.pricing?.customer_price) > money(item.customer_price)) {
    throw new Error(
      `SOURCE_SEMANTIC_REPAIR_ITEM_PRICE_EXCEEDED:${execution.pricing?.customer_price}:${item.customer_price}`,
    );
  }

  const parsed = executionPayload(execution);
  const analysis = parsed
    ? normalizeAnalysis(parsed, item)
    : unverifiedAnalysis("Provider returned invalid JSON");
  return { execution, analysis };
}

async function loadAssets(plan) {
  const ids = [...new Set(list(plan.work_items).map((item) => text(item.asset_id)))];
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", plan.organization_id)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).map((asset) => [text(asset.id), asset]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_ASSETS_MISSING:${missing.join(",")}`);
  }
  return { ids, byId };
}

async function refreshAsset(assetId, organizationId) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", assetId)
    .single();
  if (error) throw error;
  return data;
}

export async function executeCreativeSourceSemanticRepair({
  plan,
  approval_literal,
  approval_maximum,
  approval_currency,
  approved_at,
  output_file = null,
} = {}) {
  const approval = validatePlan(plan, {
    literal: approval_literal,
    maximum_amount: approval_maximum,
    currency: approval_currency,
    approved_at,
  });
  const preflight = await selectedPreflight(plan, plan.organization_id);
  const beforeBalance = await WalletRuntime.balance({
    organization_id: plan.organization_id,
    currency: approval.currency,
  });
  const priorUsages = await existingUsages(plan.organization_id, plan.plan_hash);
  const priorUsageByItem = usageByItem(priorUsages);
  let charged = money(
    priorUsages
      .filter((usage) => usage.status === "SUCCESS")
      .reduce((sum, usage) => sum + Number(usage.customer_price || 0), 0),
  );
  let paidCallCount = priorUsages.filter((usage) => usage.status === "SUCCESS").length;
  const maximumCalls = list(plan.work_items).length + retryReserveCount(plan);
  const remainingCeiling = money(approval.maximum_amount - charged);
  if (charged > approval.maximum_amount) {
    throw new Error(`SOURCE_SEMANTIC_REPAIR_PRIOR_SPEND_EXCEEDS_APPROVAL:${charged}`);
  }
  if (beforeBalance < remainingCeiling) {
    throw new Error(
      `SOURCE_SEMANTIC_REPAIR_WALLET_INSUFFICIENT:${beforeBalance}:${remainingCeiling}`,
    );
  }

  const { ids, byId } = await loadAssets(plan);
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), `avantiqo-semantic-${plan.plan_hash.slice(0, 10)}-`),
  );
  const videoCache = new Map();
  const itemResults = [];
  const assetResults = [];

  try {
    for (const item of list(plan.work_items)) {
      let asset = byId.get(text(item.asset_id));
      let items = existingRepairItems(asset, plan.plan_hash);
      if (items[item.id] && creativeAssetSemanticEvidence({
        analysis: items[item.id].analysis,
      }).verified) {
        itemResults.push({
          item_id: item.id,
          asset_id: item.asset_id,
          status: "SKIPPED_ALREADY_PERSISTED",
          usage_id: items[item.id].usage_id || null,
          customer_price: 0,
        });
        continue;
      }

      const successfulUsage = list(priorUsageByItem.get(item.id))
        .find((usage) => usage.status === "SUCCESS");
      const recoveredAnalysis = successfulUsage
        ? usageAnalysis(successfulUsage, item)
        : null;
      if (recoveredAnalysis && creativeAssetSemanticEvidence({
        analysis: recoveredAnalysis,
      }).verified) {
        items = {
          ...items,
          [item.id]: itemRecord({
            item,
            analysis: recoveredAnalysis,
            execution: {
              provider: successfulUsage.provider,
              model: successfulUsage.metadata?.model,
              pricing: {
                pricing_id: successfulUsage.pricing_id,
                customer_price: successfulUsage.customer_price,
              },
              usage: successfulUsage,
            },
            recovered: true,
          }),
        };
        asset = await persistItemProgress({ asset, items, plan, approval });
        byId.set(asset.id, asset);
        itemResults.push({
          item_id: item.id,
          asset_id: item.asset_id,
          status: "RECOVERED_FROM_USAGE",
          usage_id: successfulUsage.id,
          customer_price: 0,
        });
        continue;
      }

      let visualInput;
      if (item.kind === "IMAGE_SEMANTIC_ANALYSIS") {
        visualInput = await signedAssetUrl(asset);
      } else if (item.kind === "VIDEO_FRAME_SEMANTIC_ANALYSIS") {
        let cached = videoCache.get(asset.id);
        if (!cached) {
          const sourceUrl = await signedAssetUrl(asset);
          const extension = path.extname(text(asset.file_name)) || ".mp4";
          const sourcePath = path.join(tempRoot, `${asset.id}${extension}`);
          await downloadFile(sourceUrl, sourcePath);
          cached = {
            source_path: sourcePath,
            duration: videoDuration(asset, sourcePath),
          };
          videoCache.set(asset.id, cached);
        }
        const framePath = path.join(
          tempRoot,
          `${asset.id}-${Number(item.sample_index) + 1}.jpg`,
        );
        extractVideoFrame({
          input: cached.source_path,
          output: framePath,
          duration: cached.duration,
          fraction: item.sample_fraction,
        });
        visualInput = imageDataUrl(framePath);
      } else {
        throw new Error(`SOURCE_SEMANTIC_REPAIR_ITEM_KIND_UNSUPPORTED:${item.kind}`);
      }

      let completed = null;
      let attempt = 0;
      while (!completed && paidCallCount < maximumCalls) {
        attempt += 1;
        const projectedSpend = money(charged + Number(item.customer_price || 0));
        if (projectedSpend > approval.maximum_amount) {
          throw new Error(
            `SOURCE_SEMANTIC_REPAIR_APPROVAL_CEILING_WOULD_BE_EXCEEDED:${projectedSpend}:${approval.maximum_amount}`,
          );
        }

        const result = await executeItem({
          item,
          asset,
          image: visualInput,
          plan,
          approval,
          attempt,
        });
        paidCallCount += 1;
        charged = money(charged + Number(result.execution.pricing?.customer_price || 0));
        const verified = creativeAssetSemanticEvidence({
          analysis: result.analysis,
        }).verified;
        itemResults.push({
          item_id: item.id,
          asset_id: item.asset_id,
          status: verified ? "VERIFIED" : "UNVERIFIED",
          attempt,
          usage_id: result.execution.usage?.id || null,
          customer_price: money(result.execution.pricing?.customer_price || 0),
          cumulative_charge: charged,
        });
        if (verified) completed = result;
      }

      if (!completed) {
        if (paidCallCount >= maximumCalls) {
          throw new Error(
            `SOURCE_SEMANTIC_REPAIR_CALL_LIMIT_REACHED:${paidCallCount}:${maximumCalls}`,
          );
        }
        throw new Error(`SOURCE_SEMANTIC_REPAIR_ITEM_UNVERIFIED:${item.id}`);
      }
      items = {
        ...items,
        [item.id]: itemRecord({
          item,
          analysis: completed.analysis,
          execution: completed.execution,
        }),
      };
      asset = await persistItemProgress({ asset, items, plan, approval });
      byId.set(asset.id, asset);
    }

    for (const assetId of ids) {
      const asset = await refreshAsset(assetId, plan.organization_id);
      const items = existingRepairItems(asset, plan.plan_hash);
      const assetWorkItems = list(plan.work_items).filter((item) =>
        text(item.asset_id) === assetId,
      );
      const completedItemCount = assetWorkItems.filter((item) =>
        items[item.id] && creativeAssetSemanticEvidence({
          analysis: items[item.id].analysis,
        }).verified,
      ).length;
      if (completedItemCount !== assetWorkItems.length) {
        throw new Error(
          `SOURCE_SEMANTIC_REPAIR_ASSET_ITEMS_INCOMPLETE:${assetId}:${completedItemCount}:${assetWorkItems.length}`,
        );
      }

      const finalAnalysis = assetWorkItems[0]?.kind === "IMAGE_SEMANTIC_ANALYSIS"
        ? aggregateImageAnalysis(asset, items, plan.plan_hash)
        : aggregateVideoAnalysis(asset, items, plan.plan_hash, assetWorkItems);
      const updated = await persistAssetAnalysis({
        asset,
        finalAnalysis,
        plan,
        approval,
      });
      byId.set(assetId, updated);
      const semantic = creativeAssetSemanticEvidence(updated);
      assetResults.push({
        asset_id: assetId,
        file_name: updated.file_name,
        media_kind: finalAnalysis.media_kind,
        semantic_status: semantic.status,
        semantic_evidence_count: semantic.evidence_count,
        verified: semantic.verified,
      });
    }

    const finalAssets = ids.map((id) => byId.get(id));
    const gate = assertCreativeSourceAssetsSemanticReady({
      assets: finalAssets,
      required_asset_ids: ids,
    });
    const afterBalance = await WalletRuntime.balance({
      organization_id: plan.organization_id,
      currency: approval.currency,
    });
    const finalUsages = await existingUsages(plan.organization_id, plan.plan_hash);
    const finalCharged = money(
      finalUsages
        .filter((usage) => usage.status === "SUCCESS")
        .reduce((sum, usage) => sum + Number(usage.customer_price || 0), 0),
    );
    if (finalCharged > approval.maximum_amount) {
      throw new Error(
        `SOURCE_SEMANTIC_REPAIR_FINAL_CHARGE_EXCEEDS_APPROVAL:${finalCharged}:${approval.maximum_amount}`,
      );
    }

    const reportCore = {
      contract: REPAIR_CONTRACT,
      completed_at: new Date().toISOString(),
      organization_id: plan.organization_id,
      creative_project_id: plan.creative_project_id,
      plan_hash: plan.plan_hash,
      approval,
      preflight: {
        provider: preflight.provider,
        model: preflight.model,
        pricing_id: preflight.pricing.pricing_id,
        customer_price_per_analysis: preflight.pricing.customer_price,
        currency: preflight.pricing.currency,
      },
      counts: {
        planned_work_items: list(plan.work_items).length,
        retry_reserve_count: retryReserveCount(plan),
        maximum_paid_calls: maximumCalls,
        paid_successful_usage_count:
          finalUsages.filter((usage) => usage.status === "SUCCESS").length,
        failed_usage_count:
          finalUsages.filter((usage) => usage.status === "FAILED").length,
        verified_asset_count: assetResults.filter((asset) => asset.verified).length,
      },
      cost: {
        approval_ceiling: approval.maximum_amount,
        charged: finalCharged,
        remaining_authorized_amount: money(approval.maximum_amount - finalCharged),
        wallet_balance_before: beforeBalance,
        wallet_balance_after: afterBalance,
        wallet_delta: money(beforeBalance - afterBalance),
        currency: approval.currency,
      },
      universality: {
        fixed_business_vocabulary_used: false,
        fixed_asset_count_used: false,
        fixed_analysis_count_used: false,
        fixed_currency_used: false,
        fixed_approval_amount_used: false,
        dynamic_sampling_policy_used: true,
      },
      semantic_gate: gate,
      item_results: itemResults,
      asset_results: assetResults,
      production_authorized: false,
      publication_authorized: false,
      readiness: gate.passed === true && assetResults.length === ids.length
        ? "PASS"
        : "FAIL",
    };
    const report = {
      ...reportCore,
      execution_hash: digest(reportCore),
    };
    if (output_file) {
      fs.writeFileSync(
        path.resolve(output_file),
        `${JSON.stringify(report, null, 2)}\n`,
        "utf8",
      );
    }
    return report;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export const CreativeSourceSemanticRepairExecutionRuntime = Object.freeze({
  contract: REPAIR_CONTRACT,
  plan_contract: PLAN_CONTRACT,
  plan_mode: PLAN_MODE,
  approvalLiteralForPlan: sourceSemanticRepairApprovalLiteral,
  execute: executeCreativeSourceSemanticRepair,
});
