#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import nextEnv from "@next/env";

import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveProviders,
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

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

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

function round(value) {
  return Number(Number(value || 0).toFixed(6));
}

function firstText(...values) {
  return values.map(text).find(Boolean) || "";
}

function promptFieldPaths(value, currentPath = "plan", matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      promptFieldPaths(item, `${currentPath}.${index}`, matches),
    );
    return matches;
  }
  if (!value || typeof value !== "object") return matches;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replaceAll("-", "_")
      .toLowerCase();
    const childPath = `${currentPath}.${key}`;
    if (
      normalized === "prompt" ||
      normalized.endsWith("_prompt") ||
      normalized.includes("prompt_template")
    ) {
      matches.push(childPath);
    }
    promptFieldPaths(child, childPath, matches);
  }
  return matches;
}

function masterDuration(plan = {}) {
  const deliverable = object(list(plan.deliverables)[0]);
  const output = object(deliverable.output_spec);
  const explicit = finite(
    output.duration_seconds ?? plan.temporal_contract?.duration_seconds,
  );
  if (explicit && explicit > 0) return explicit;

  const total = list(plan.scenes).reduce(
    (sum, scene) => sum + Math.max(0, finite(scene.duration_seconds, 0)),
    0,
  );
  if (total > 0) return total;
  throw new Error("CREATIVE_COST_ESTIMATE_MASTER_DURATION_REQUIRED");
}

function shotDuration(shot = {}) {
  const duration = finite(
    shot.duration_seconds ??
      shot.duration ??
      shot.timing?.duration_seconds,
  );
  if (!duration || duration <= 0) {
    throw new Error(
      `CREATIVE_COST_ESTIMATE_SHOT_DURATION_REQUIRED:${text(shot.id) || "unknown"}`,
    );
  }
  return duration;
}

function soundtrackRequired(plan = {}) {
  const explicitPrimaryAudio = firstText(
    plan.production?.primary_audio_asset_id,
    plan.production?.primary_audio_asset_node_id,
    list(plan.deliverables)[0]?.output_spec?.primary_audio_asset_id,
  );
  if (explicitPrimaryAudio) return false;
  if (
    plan.production?.audio_required === false &&
    plan.production?.generate_editorial_soundtrack === false
  ) return false;
  return true;
}

function humanIdentityGateRequired(shot = {}) {
  return Boolean(
    shot.identity_requirements?.profile_id ||
      shot.identity_requirements?.identity_profile_id ||
      shot.performance_contract?.identity_profile_id ||
      shot.metadata?.identity_profile_id,
  );
}

function lipSyncRequired(shot = {}) {
  return Boolean(
    shot.performance_contract?.lip_sync_required === true ||
      shot.performance_contract?.audio_conditioned_lip_sync_required === true,
  );
}

function workItems(plan = {}) {
  const items = [];
  const shots = list(plan.scenes).flatMap((scene) => list(scene.shots));

  for (const shot of shots) {
    const generation = object(shot.generation);
    if (generation.required !== true) continue;

    const serviceId = firstText(
      generation.service,
      generation.capability,
      shot.service_id,
      shot.capability,
    );
    if (!serviceId) {
      throw new Error(
        `CREATIVE_COST_ESTIMATE_SHOT_SERVICE_REQUIRED:${text(shot.id) || "unknown"}`,
      );
    }

    const duration = shotDuration(shot);
    items.push({
      id: `shot-generation:${text(shot.id)}`,
      kind: "SHOT_GENERATION",
      service_id: serviceId,
      duration_seconds: duration,
      count: 1,
      source_id: text(shot.id),
    });

    const capabilityCorpus = `${generation.service || ""} ${generation.capability || ""}`
      .toLowerCase();
    if (capabilityCorpus.includes("video") || capabilityCorpus.includes("image")) {
      items.push({
        id: `perceptual-review:${text(shot.id)}`,
        kind: "PERCEPTUAL_REVIEW",
        service_id: "ai.image.analyze",
        duration_seconds: duration,
        count: 1,
        source_id: text(shot.id),
      });
    }

    if (lipSyncRequired(shot)) {
      items.push({
        id: `lip-sync:${text(shot.id)}`,
        kind: "LIP_SYNC",
        service_id: "ai.video.lip_sync",
        duration_seconds: duration,
        count: 1,
        source_id: text(shot.id),
      });
    }

    if (humanIdentityGateRequired(shot)) {
      items.push({
        id: `identity-keyframe:${text(shot.id)}`,
        kind: "IDENTITY_KEYFRAME",
        service_id: "ai.image.generate",
        duration_seconds: 0,
        count: 1,
        source_id: text(shot.id),
      });
    }
  }

  if (soundtrackRequired(plan)) {
    items.push({
      id: "master-soundtrack",
      kind: "MASTER_SOUNDTRACK",
      service_id: "ai.music.generate",
      duration_seconds: masterDuration(plan),
      count: 1,
      source_id: null,
    });
  }

  return items;
}

function quantityForUnit(unitValue, item = {}) {
  const unit = text(unitValue).toLowerCase().replaceAll("-", "_");
  const duration = Math.max(0, finite(item.duration_seconds, 0));
  const count = Math.max(1, finite(item.count, 1));

  if (["second", "seconds", "sec", "generated_second", "video_second"].includes(unit)) {
    return duration || count;
  }
  if (["minute", "minutes", "min", "generated_minute", "video_minute"].includes(unit)) {
    return duration > 0 ? duration / 60 : count;
  }
  if (["millisecond", "milliseconds", "ms"].includes(unit)) {
    return duration > 0 ? duration * 1000 : count;
  }
  if (["frame", "frames"].includes(unit)) {
    return duration > 0 ? duration * 30 : count;
  }
  return count;
}

function aggregateByService(items = []) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.service_id)) groups.set(item.service_id, []);
    groups.get(item.service_id).push(item);
  }
  return groups;
}

async function priceCandidate(row, items, currency) {
  let supplier = 0;
  let customer = 0;
  let estimated = false;
  const itemPrices = [];

  for (const item of items) {
    const quantity = quantityForUnit(row.unit, item);
    const pricing = await PricingRuntime.resolveById({
      pricing_id: row.id,
      currency,
      usage: {
        quantity,
      },
    });
    supplier += pricing.supplier_cost;
    customer += pricing.customer_price;
    estimated = estimated || pricing.estimated === true;
    itemPrices.push({
      item_id: item.id,
      kind: item.kind,
      duration_seconds: item.duration_seconds,
      quantity,
      unit: pricing.unit || row.unit || "request",
      supplier_cost: pricing.supplier_cost,
      customer_price: pricing.customer_price,
    });
  }

  return {
    pricing_id: row.id,
    provider: row.provider,
    model: row.model || null,
    capability: row.capability || null,
    currency: row.currency || currency,
    unit: row.unit || null,
    supplier_cost: round(supplier),
    customer_price: round(customer),
    estimated,
    quality_score: row.quality_score ?? null,
    speed_score: row.speed_score ?? null,
    reliability_score: row.reliability_score ?? null,
    item_prices: itemPrices,
  };
}

const inputPath = path.resolve(text(process.argv[2]));
if (!inputPath || !fs.existsSync(inputPath)) {
  throw new Error(`CREATIVE_COST_ESTIMATE_DIRECTION_FILE_NOT_FOUND:${inputPath || "missing"}`);
}

const organizationId = text(process.env.ORGANIZATION_ID);
if (!organizationId) throw new Error("ORGANIZATION_ID_REQUIRED");

const currency = text(process.env.CURRENCY || "THB").toUpperCase();
const walletBalance = finite(process.env.AVAILABLE_WALLET_BALANCE, null);
const raw = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const plan = object(raw.plan || raw.direction?.plan || raw.output?.plan || raw);

if (plan.validation?.passed !== true) {
  throw new Error("CREATIVE_COST_ESTIMATE_VALIDATED_PLAN_REQUIRED");
}
const promptPaths = promptFieldPaths(plan);
if (promptPaths.length) {
  throw new Error(
    `CREATIVE_COST_ESTIMATE_PROMPTLESS_PLAN_REQUIRED:${promptPaths.slice(0, 10).join(",")}`,
  );
}

const items = workItems(plan);
const groups = aggregateByService(items);
const blockers = [];
const serviceEstimates = [];

for (const [serviceId, serviceItems] of groups.entries()) {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: serviceId,
  });
  if (!organizationService) {
    blockers.push(`SERVICE_NOT_ENABLED:${serviceId}`);
    continue;
  }

  const capabilities = resolveServiceCapabilities(serviceId);
  const executionCapability = resolvePrimaryExecutionCapability(
    capabilities?.capabilities || [],
  );
  if (!executionCapability) {
    blockers.push(`EXECUTION_CAPABILITY_MISSING:${serviceId}`);
    continue;
  }

  const resolved = await resolveProviders({
    capability: executionCapability,
    currency,
  });
  const rows = list(resolved.pricing).filter((row) =>
    text(row.currency || currency).toUpperCase() === currency,
  );
  if (!rows.length) {
    blockers.push(`PRICING_NOT_CONFIGURED:${serviceId}:${executionCapability}:${currency}`);
    continue;
  }

  const candidates = [];
  for (const row of rows) {
    try {
      candidates.push(await priceCandidate(row, serviceItems, currency));
    } catch (error) {
      candidates.push({
        pricing_id: row.id,
        provider: row.provider,
        model: row.model || null,
        error: error.message,
      });
    }
  }

  const priced = candidates.filter((candidate) =>
    Number.isFinite(Number(candidate.customer_price)) &&
    Number(candidate.customer_price) > 0,
  );
  if (!priced.length) {
    blockers.push(`NO_RESOLVABLE_PRICE:${serviceId}:${executionCapability}`);
    serviceEstimates.push({
      service_id: serviceId,
      capability: executionCapability,
      item_count: serviceItems.length,
      candidates,
    });
    continue;
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability: executionCapability,
    currency,
    policy: object(organizationService.provider_policy),
  });
  const selectedCandidate = priced.find((candidate) =>
    candidate.pricing_id === selected.pricing_id,
  ) || priced.find((candidate) =>
    candidate.provider === selected.provider &&
    (!selected.model || candidate.model === selected.model),
  );
  if (!selectedCandidate) {
    blockers.push(`SELECTED_PROVIDER_PRICE_MISSING:${serviceId}:${selected.provider}`);
  }

  const sorted = [...priced].sort((left, right) =>
    left.customer_price - right.customer_price,
  );
  serviceEstimates.push({
    service_id: serviceId,
    capability: executionCapability,
    item_count: serviceItems.length,
    total_duration_seconds: round(
      serviceItems.reduce((sum, item) => sum + item.duration_seconds, 0),
    ),
    provider_policy: object(organizationService.provider_policy),
    selection_evidence: selected.selection_evidence || null,
    selected: selectedCandidate || null,
    cheapest: sorted[0],
    highest: sorted.at(-1),
    candidates,
  });
}

function scenarioTotal(field) {
  return round(serviceEstimates.reduce((sum, estimate) =>
    sum + Number(estimate[field]?.customer_price || 0),
  0));
}

const selectedBaseline = scenarioTotal("selected");
const cheapestBaseline = scenarioTotal("cheapest");
const highestBaseline = scenarioTotal("highest");

const selectedGenerationItemPrices = serviceEstimates
  .flatMap((estimate) => list(estimate.selected?.item_prices))
  .filter((item) => item.kind === "SHOT_GENERATION")
  .sort((left, right) => right.customer_price - left.customer_price);
const selectedReviewItemPrices = serviceEstimates
  .flatMap((estimate) => list(estimate.selected?.item_prices))
  .filter((item) => item.kind === "PERCEPTUAL_REVIEW")
  .sort((left, right) => right.customer_price - left.customer_price);

const oneShotRepairReserve = round(
  Number(selectedGenerationItemPrices[0]?.customer_price || 0) +
  Number(selectedReviewItemPrices[0]?.customer_price || 0),
);
const recommendedApprovalCeiling = round(
  selectedBaseline + oneShotRepairReserve,
);

const report = {
  contract: "CREATIVE_PRODUCTION_COST_ESTIMATE_V1",
  generated_at: new Date().toISOString(),
  input_path: inputPath,
  organization_id: organizationId,
  currency,
  read_only: true,
  provider_calls_executed: false,
  usage_created: false,
  wallet_reserved: false,
  wallet_charged: false,
  graph_created: false,
  tasks_created: false,
  production_authorized: false,
  promptless_direction_verified: true,
  counts: {
    scene_count: list(plan.scenes).length,
    shot_count: list(plan.scenes).reduce(
      (sum, scene) => sum + list(scene.shots).length,
      0,
    ),
    production_work_item_count: items.length,
    shot_generation_count: items.filter((item) => item.kind === "SHOT_GENERATION").length,
    perceptual_review_count: items.filter((item) => item.kind === "PERCEPTUAL_REVIEW").length,
    soundtrack_generation_count: items.filter((item) => item.kind === "MASTER_SOUNDTRACK").length,
    identity_keyframe_count: items.filter((item) => item.kind === "IDENTITY_KEYFRAME").length,
    lip_sync_count: items.filter((item) => item.kind === "LIP_SYNC").length,
  },
  scenarios: {
    cheapest_baseline: cheapestBaseline,
    selected_baseline: selectedBaseline,
    highest_baseline: highestBaseline,
    one_shot_repair_reserve: oneShotRepairReserve,
    recommended_approval_ceiling: recommendedApprovalCeiling,
  },
  wallet: {
    available_balance: walletBalance,
    sufficient_for_selected_baseline:
      walletBalance === null ? null : walletBalance >= selectedBaseline,
    sufficient_for_recommended_ceiling:
      walletBalance === null ? null : walletBalance >= recommendedApprovalCeiling,
    remaining_after_selected_baseline:
      walletBalance === null ? null : round(walletBalance - selectedBaseline),
    remaining_after_recommended_ceiling:
      walletBalance === null ? null : round(walletBalance - recommendedApprovalCeiling),
  },
  blockers,
  work_items: items,
  services: serviceEstimates,
};

const outputPath = path.resolve(
  text(process.env.COST_ESTIMATE_OUTPUT) ||
    `${inputPath.replace(/\.json$/i, "")}.production-cost-estimate.json`,
);
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY CREATIVE PRODUCTION COST ESTIMATE");
console.log("============================================================");
console.log(`INPUT=${inputPath}`);
console.log(`OUTPUT=${outputPath}`);
console.log(`CURRENCY=${currency}`);
console.log(`SCENE_COUNT=${report.counts.scene_count}`);
console.log(`SHOT_COUNT=${report.counts.shot_count}`);
console.log(`PRODUCTION_WORK_ITEM_COUNT=${report.counts.production_work_item_count}`);
console.log(`SHOT_GENERATION_COUNT=${report.counts.shot_generation_count}`);
console.log(`PERCEPTUAL_REVIEW_COUNT=${report.counts.perceptual_review_count}`);
console.log(`SOUNDTRACK_GENERATION_COUNT=${report.counts.soundtrack_generation_count}`);
console.log(`IDENTITY_KEYFRAME_COUNT=${report.counts.identity_keyframe_count}`);
console.log(`LIP_SYNC_COUNT=${report.counts.lip_sync_count}`);
console.log(`CHEAPEST_BASELINE=${cheapestBaseline}`);
console.log(`SELECTED_BASELINE=${selectedBaseline}`);
console.log(`HIGHEST_BASELINE=${highestBaseline}`);
console.log(`ONE_SHOT_REPAIR_RESERVE=${oneShotRepairReserve}`);
console.log(`RECOMMENDED_APPROVAL_CEILING=${recommendedApprovalCeiling}`);
console.log(`AVAILABLE_WALLET_BALANCE=${walletBalance ?? "UNRESOLVED"}`);
console.log(`WALLET_SUFFICIENT_FOR_SELECTED_BASELINE=${report.wallet.sufficient_for_selected_baseline ?? "UNRESOLVED"}`);
console.log(`WALLET_SUFFICIENT_FOR_RECOMMENDED_CEILING=${report.wallet.sufficient_for_recommended_ceiling ?? "UNRESOLVED"}`);
console.log(`COST_ESTIMATE_BLOCKER_COUNT=${blockers.length}`);
console.log(`COST_ESTIMATE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log("PROMPTLESS_DIRECTION_VERIFIED=YES");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("USAGE_CREATED=NO");
console.log("WALLET_RESERVED=NO");
console.log("WALLET_CHARGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

for (const estimate of serviceEstimates) {
  console.log(
    `SERVICE_ESTIMATE=${estimate.service_id}|${estimate.capability}|items=${estimate.item_count}|selected=${estimate.selected?.provider || "NONE"}:${estimate.selected?.model || "default"}:${estimate.selected?.customer_price ?? "UNRESOLVED"}|cheapest=${estimate.cheapest?.provider || "NONE"}:${estimate.cheapest?.customer_price ?? "UNRESOLVED"}|highest=${estimate.highest?.provider || "NONE"}:${estimate.highest?.customer_price ?? "UNRESOLVED"}`,
  );
}

if (blockers.length) process.exitCode = 2;
