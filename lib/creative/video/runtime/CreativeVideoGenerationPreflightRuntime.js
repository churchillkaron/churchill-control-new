import crypto from "node:crypto";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  PricingRuntime,
} from "@/lib/platform/service-runtime/pricing/PricingRuntime";
import {
  resolveCreativeVideoProviderConfiguration,
} from "./CreativeVideoProviderConfigurationRuntime";
import {
  resolveCreativeVideoExecutionQuality,
} from "./CreativeVideoQualityPreferenceRuntime";

const CONTRACT = "CREATIVE_VIDEO_GENERATION_PREFLIGHT_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "preflight_sha256")
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function digest(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function taskDuration(task = {}) {
  const input = object(task.input);
  const generation = object(input.generation);
  const outputSpec = object(generation.output_spec || input.output_spec);
  const requirements = object(input.requirements);
  return positive(
    input.quantity ??
    input.media_duration_seconds ??
    input.duration_seconds ??
    outputSpec.duration_seconds ??
    generation.estimated_seconds ??
    generation.duration_seconds ??
    requirements.duration_seconds ??
    task.timing?.estimated_seconds,
  );
}

function taskAspectRatio(task = {}) {
  const input = object(task.input);
  const generation = object(input.generation);
  const outputSpec = object(generation.output_spec || input.output_spec);
  const shotBible = object(input.shot_bible || input.shotBible);
  const shotOutput = object(shotBible.output);
  return text(
    outputSpec.aspect_ratio ||
    outputSpec.aspectRatio ||
    generation.aspect_ratio ||
    generation.aspectRatio ||
    input.aspect_ratio ||
    input.aspectRatio ||
    shotOutput.aspect_ratio ||
    shotOutput.aspectRatio,
  ) || null;
}

function sourceAssetId(task = {}) {
  const input = object(task.input);
  const generation = object(input.generation);
  const providerParameters = object(input.provider_parameters);
  return text(
    generation.primary_source_asset_id ||
    providerParameters.primary_source_asset_id ||
    task.metadata?.source_asset_id,
  ) || null;
}

function preferredProvider(task = {}) {
  return text(
    task.provider_id ||
    task.input?.generation?.provider ||
    task.input?.provider ||
    task.metadata?.provider,
  ) || null;
}

export async function resolveCreativeVideoGenerationPreflight({
  task_id,
  currency = null,
} = {}) {
  if (!task_id) throw new Error("CREATIVE_VIDEO_PREFLIGHT_TASK_ID_REQUIRED");

  const task = await ProductionTaskRuntime.get(task_id);
  if (!task) throw new Error("CREATIVE_VIDEO_PREFLIGHT_TASK_NOT_FOUND");
  if (!task.organization_id) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_ORGANIZATION_REQUIRED");
  }
  if (!task.creative_project_id) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_PROJECT_REQUIRED");
  }
  if (!task.production_graph_id) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_GRAPH_REQUIRED");
  }

  const project = await CreativeProjectRuntime.get(task.creative_project_id);
  if (!project) throw new Error("CREATIVE_VIDEO_PREFLIGHT_PROJECT_NOT_FOUND");
  if (text(project.organization_id) !== text(task.organization_id)) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_PROJECT_SCOPE_MISMATCH");
  }

  const duration = taskDuration(task);
  if (!duration) throw new Error("CREATIVE_VIDEO_PREFLIGHT_DURATION_REQUIRED");
  const aspectRatio = taskAspectRatio(task);
  if (!aspectRatio) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_ASPECT_RATIO_REQUIRED");
  }

  const configured = await resolveCreativeVideoProviderConfiguration({
    organization_id: task.organization_id,
    currency,
    preferred_provider: preferredProvider(task),
  });

  const quality = resolveCreativeVideoExecutionQuality({
    project,
    provider: configured.provider,
    model: configured.model,
    duration_seconds: duration,
    aspect_ratio: aspectRatio,
    provider_capabilities: configured.video_capabilities,
  });
  if (!quality.ready || !quality.resolution) {
    throw new Error(
      `CREATIVE_VIDEO_PREFLIGHT_QUALITY_NOT_EXECUTABLE:${quality.reasons.join("|") || "unknown"}`,
    );
  }

  const pricing = await PricingRuntime.resolveById({
    pricing_id: configured.pricing_id,
    currency: configured.currency || currency || null,
    usage: {
      quantity: duration,
      pricing_dimensions: {
        resolution: quality.resolution,
      },
    },
  });

  if (positive(pricing.priced_quantity) !== duration) {
    throw new Error(
      `CREATIVE_VIDEO_PREFLIGHT_PRICED_QUANTITY_MISMATCH:${pricing.priced_quantity}:${duration}`,
    );
  }
  if (!text(pricing.unit)) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_PRICING_UNIT_REQUIRED");
  }
  if (positive(pricing.customer_price) === null) {
    throw new Error("CREATIVE_VIDEO_PREFLIGHT_CUSTOMER_PRICE_REQUIRED");
  }

  const preflight = {
    contract: CONTRACT,
    service_execution_contract: "SERVICE_EXECUTION_PREFLIGHT_V1",
    organization_id: task.organization_id,
    organization_service_id: configured.organization_service_id,
    creative_project_id: task.creative_project_id,
    production_graph_id: task.production_graph_id,
    task_id: task.id,
    service_id: configured.service_id,
    capability: configured.capability,
    provider: configured.provider,
    model: configured.model || null,
    pricing_id: pricing.pricing_id,
    configuration_contract:
      configured.video_capabilities?.contract || null,
    requested_quality:
      quality.requested_preference || null,
    resolution: quality.resolution,
    aspect_ratio: quality.aspect_ratio,
    dimensions: quality.dimensions,
    provider_native_frame_rate: quality.provider_native_frame_rate,
    native_audio: quality.native_audio,
    quantity: duration,
    duration_seconds: duration,
    unit: pricing.unit,
    currency: pricing.currency,
    supplier_cost: pricing.supplier_cost,
    platform_markup: pricing.platform_markup,
    customer_price: pricing.customer_price,
    pricing_dimensions: pricing.pricing_dimensions || {
      resolution: quality.resolution,
    },
    source_asset_id: sourceAssetId(task),
  };

  return {
    ...preflight,
    preflight_sha256: digest(preflight),
  };
}

export function serviceExecutionPreflightFromCreativeVideo(preflight = {}) {
  if (text(preflight.contract) !== CONTRACT || !text(preflight.preflight_sha256)) {
    throw new Error("CREATIVE_VIDEO_APPROVED_PREFLIGHT_REQUIRED");
  }
  if (digest(preflight) !== text(preflight.preflight_sha256)) {
    throw new Error("CREATIVE_VIDEO_APPROVED_PREFLIGHT_HASH_MISMATCH");
  }

  return {
    contract: "SERVICE_EXECUTION_PREFLIGHT_V1",
    organization_service_id: preflight.organization_service_id,
    service_id: preflight.service_id,
    capability: preflight.capability,
    provider: preflight.provider,
    model: preflight.model,
    pricing_id: preflight.pricing_id,
    currency: preflight.currency,
    quantity: preflight.quantity,
    unit: preflight.unit,
    customer_price: preflight.customer_price,
    pricing_dimensions: object(preflight.pricing_dimensions),
    creative_preflight_contract: CONTRACT,
    creative_preflight_sha256: preflight.preflight_sha256,
  };
}

export const CreativeVideoGenerationPreflightRuntime = Object.freeze({
  contract: CONTRACT,
  resolve: resolveCreativeVideoGenerationPreflight,
  serviceExecutionPreflight: serviceExecutionPreflightFromCreativeVideo,
  hash: digest,
});
