export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import fs from "node:fs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  getProvider,
} from "@/lib/platform/service-runtime/providers/ProviderRegistry";
import {
  resolveProviderCredential,
} from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import {
  getProviderPricing,
} from "@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository";
import {
  CREATIVE_SEMANTIC_QUALITY_CHECKS,
} from "@/lib/creative/quality/runtime/CreativeSemanticQualityRuntime";

const CREATIVE_QUALITY_NUMBER_FIELDS = Object.freeze([
  "minimum_scene_score",
  "regenerate_below_score",
]);
const CREATIVE_QUALITY_BOOLEAN_FIELDS = Object.freeze([
  "require_brand_fit",
  "require_non_ai_feel",
  "require_identity_continuity",
  "require_product_continuity",
  "require_story_progression",
]);
const SEMANTIC_CHECK_IDS = new Set(CREATIVE_SEMANTIC_QUALITY_CHECKS);

function configured(value) {
  return Boolean(String(value ?? "").trim());
}

function executable(value) {
  if (!configured(value)) return false;
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function check(id, required, passed, evidence = null) {
  return {
    id,
    required: Boolean(required),
    passed: Boolean(passed),
    evidence,
  };
}

function safeProvider(provider = null) {
  if (!provider) return null;
  return {
    id: provider.id,
    runtime: provider.runtime,
    runtime_available: provider.runtimeAvailable !== false,
    active: provider.active === true,
    capabilities: list(provider.capabilities),
    connection_model: provider.connectionModel || null,
  };
}

function normalizedExecutionRequirements(value) {
  return list(value).map((entry) => {
    const item = object(entry);
    return {
      service_id: text(item.service_id),
      provider_id: text(item.provider_id || item.provider).toLowerCase(),
      capability: text(item.capability),
      model: text(item.model) || null,
      country: text(item.country) || null,
      currency: text(item.currency).toUpperCase(),
    };
  });
}

function validateCreativeQualityPolicy(value) {
  const policy = object(value);
  const failures = [];
  if (!text(policy.version)) failures.push("version");
  for (const field of CREATIVE_QUALITY_NUMBER_FIELDS) {
    const current = number(policy[field], null);
    if (current === null || current < 0 || current > 100) failures.push(field);
  }
  if (
    number(policy.regenerate_below_score, null) !== null &&
    number(policy.minimum_scene_score, null) !== null &&
    Number(policy.regenerate_below_score) > Number(policy.minimum_scene_score)
  ) {
    failures.push("regeneration_threshold_order");
  }
  for (const field of CREATIVE_QUALITY_BOOLEAN_FIELDS) {
    if (typeof policy[field] !== "boolean") failures.push(field);
  }
  return { passed: failures.length === 0, failures, policy };
}

function validateSemanticPolicy(value) {
  const policy = object(value);
  const failures = [];
  const requiredChecks = [...new Set(
    list(policy.required_checks).map(text).filter(Boolean),
  )];
  const unknownChecks = requiredChecks.filter((id) => !SEMANTIC_CHECK_IDS.has(id));
  const minimumConfidence = number(policy.minimum_confidence, null);
  const minimumScore = number(policy.minimum_score, null);

  if (!text(policy.version)) failures.push("version");
  if (!requiredChecks.length) failures.push("required_checks");
  if (unknownChecks.length) failures.push("unknown_required_checks");
  if (
    minimumConfidence === null ||
    minimumConfidence < 0 ||
    minimumConfidence > 100
  ) failures.push("minimum_confidence");
  if (minimumScore === null || minimumScore < 0 || minimumScore > 100) {
    failures.push("minimum_score");
  }
  if (typeof policy.require_audio_review !== "boolean") {
    failures.push("require_audio_review");
  }
  if (!text(policy.service_id)) failures.push("service_id");
  if (!text(policy.provider_id)) failures.push("provider_id");
  if (!text(policy.capability)) failures.push("capability");
  if (!text(policy.model)) failures.push("model");

  return {
    passed: failures.length === 0,
    failures,
    unknown_checks: unknownChecks,
    policy,
  };
}

function validatePublishTarget(value, expectedId, mediaKind) {
  const target = object(value);
  const targetId = text(target.id || target.key || target.channel || target.provider);
  const providerId = text(
    target.provider_id || target.provider || target.connector,
  ).toLowerCase();
  const serviceId = text(target.service_id);
  const declaredKind = text(target.media_kind).toLowerCase();
  const status = text(target.status).toUpperCase();
  const failures = [];

  if (!targetId) failures.push("target_id");
  if (targetId !== expectedId) failures.push("target_id_mismatch");
  if (!providerId) failures.push("provider_id");
  if (!serviceId) failures.push("service_id");
  if (target.enabled === false || ["DISABLED", "INACTIVE", "SUSPENDED"].includes(status)) {
    failures.push("target_disabled");
  }
  if (!mediaKind) failures.push("media_kind_required");
  if (declaredKind && declaredKind !== mediaKind) failures.push("media_kind_mismatch");
  if (mediaKind && target[`supports_${mediaKind}`] !== true) {
    failures.push(`supports_${mediaKind}`);
  }

  return {
    passed: failures.length === 0,
    failures,
    target: {
      id: targetId || null,
      provider_id: providerId || null,
      service_id: serviceId || null,
      channel: target.channel || null,
      media_kind: declaredKind || null,
      supports_media_kind: mediaKind
        ? target[`supports_${mediaKind}`] === true
        : false,
      enabled: target.enabled !== false,
      status: target.status || null,
    },
  };
}

async function queryOrganizationServices(organizationId, serviceIds) {
  if (!serviceIds.length) return { rows: [], error: null };
  const { data, error } = await supabaseAdmin
    .from("organization_services")
    .select("*")
    .eq("organization_id", organizationId)
    .in("service_id", serviceIds);
  return { rows: data || [], error: error?.message || null };
}

async function queryWallet(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_wallets")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { row: data || null, error: error?.message || null };
}

async function querySelectedAssets(organizationId, assetIds) {
  if (!assetIds.length) return { rows: [], error: null };
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("*")
    .eq("organization_id", organizationId)
    .in("id", assetIds);
  return { rows: data || [], error: error?.message || null };
}

async function queryBucket(bucket) {
  if (!configured(bucket)) return { found: false, private: false, error: null };
  const { data, error } = await supabaseAdmin.storage.getBucket(bucket);
  return {
    found: Boolean(data?.id),
    private: data?.public === false,
    error: error?.message || null,
  };
}

async function inspectExecutionRequirement(organizationId, requirement) {
  const provider = getProvider(requirement.provider_id);
  let credentialPresent = false;
  let credentialError = null;
  let pricing = null;
  let pricingError = null;

  if (provider) {
    try {
      credentialPresent = Boolean(await resolveProviderCredential({
        organization_id: organizationId,
        provider: requirement.provider_id,
      }));
    } catch (error) {
      credentialError = error.message;
    }
    try {
      pricing = await getProviderPricing({
        provider: requirement.provider_id,
        capability: requirement.capability,
        model: requirement.model,
        country: requirement.country,
        currency: requirement.currency,
      });
    } catch (error) {
      pricingError = error.message;
    }
  }

  const providerSupportsCapability = Boolean(
    provider && list(provider.capabilities).includes(requirement.capability),
  );
  const pricingCurrency = text(pricing?.currency).toUpperCase();

  return {
    ...requirement,
    provider: safeProvider(provider),
    provider_known: Boolean(provider),
    provider_active: provider?.active === true,
    provider_runtime_available: provider?.runtimeAvailable !== false,
    provider_supports_capability: providerSupportsCapability,
    credential_present: credentialPresent,
    credential_error: credentialError,
    pricing_present: Boolean(pricing),
    pricing_id: pricing?.id || null,
    pricing_currency: pricingCurrency || null,
    pricing_currency_matches:
      Boolean(pricingCurrency) && pricingCurrency === requirement.currency,
    pricing_unit: pricing?.unit || null,
    pricing_error: pricingError,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    if (!organizationId) {
      return Response.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.preflight",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const executionRequirements = normalizedExecutionRequirements(
      body.execution_requirements,
    );
    const selectedAssetIds = list(body.selected_asset_ids).map(text).filter(Boolean);
    const estimatedMaximumCost = number(body.estimated_maximum_cost, null);
    const estimatedMaximumCostCurrency = text(
      body.estimated_maximum_cost_currency,
    ).toUpperCase();
    const publishTargetId = text(body.publish_target_id);
    const requiredMediaKind = text(body.required_media_kind).toLowerCase();
    const creativeQuality = validateCreativeQualityPolicy(
      body.creative_quality_policy,
    );
    const semanticQuality = validateSemanticPolicy(
      body.semantic_quality_policy,
    );
    const publishTarget = validatePublishTarget(
      body.publish_target,
      publishTargetId,
      requiredMediaKind,
    );
    const semanticExecutionLinked = executionRequirements.some((item) =>
      item.service_id === text(semanticQuality.policy.service_id) &&
      item.provider_id === text(semanticQuality.policy.provider_id).toLowerCase() &&
      item.capability === text(semanticQuality.policy.capability) &&
      item.model === text(semanticQuality.policy.model));
    const assetBucket = process.env.CREATIVE_MEDIA_ASSET_BUCKET;
    const renderBucket = process.env.CREATIVE_MEDIA_RENDER_BUCKET;
    const derivativeBucket = process.env.CREATIVE_MEDIA_DERIVATIVE_BUCKET;
    const ffmpegPath = process.env.CREATIVE_MEDIA_FFMPEG_PATH;
    const ffprobePath = process.env.CREATIVE_MEDIA_FFPROBE_PATH;

    const requiredServiceIds = [...new Set(
      executionRequirements.map((item) => item.service_id).filter(Boolean),
    )];
    const requiredProviderIds = [...new Set(
      executionRequirements.map((item) => item.provider_id).filter(Boolean),
    )];

    const [
      services,
      wallet,
      assets,
      assetBucketResult,
      renderBucketResult,
      derivativeBucketResult,
      executionEvidence,
    ] = await Promise.all([
      queryOrganizationServices(organizationId, requiredServiceIds),
      queryWallet(organizationId),
      querySelectedAssets(organizationId, selectedAssetIds),
      queryBucket(assetBucket),
      queryBucket(renderBucket),
      queryBucket(derivativeBucket),
      Promise.all(executionRequirements.map((item) =>
        inspectExecutionRequirement(organizationId, item))),
    ]);

    const serviceById = new Map(services.rows.map((row) => [text(row.service_id), row]));
    const missingServices = requiredServiceIds.filter((serviceId) => {
      const row = serviceById.get(serviceId);
      if (!row) return true;
      const status = text(row.status).toUpperCase();
      return row.enabled === false || ["DISABLED", "INACTIVE", "SUSPENDED"].includes(status);
    });
    const invalidExecutionRequirements = executionEvidence.filter((item) =>
      !item.service_id ||
      !item.provider_id ||
      !item.capability ||
      !item.currency ||
      !item.provider_known ||
      !item.provider_active ||
      !item.provider_runtime_available ||
      !item.provider_supports_capability ||
      !item.credential_present ||
      !item.pricing_present ||
      !item.pricing_currency_matches,
    );

    const assetById = new Map(assets.rows.map((row) => [text(row.id), row]));
    const invalidAssets = selectedAssetIds.map((assetId) => {
      const asset = assetById.get(assetId);
      if (!asset) return { asset_id: assetId, reason: "NOT_FOUND" };
      const status = text(asset.status).toUpperCase();
      if (asset.archived === true || ["ARCHIVED", "DISABLED", "DELETED"].includes(status)) {
        return { asset_id: assetId, reason: "UNAVAILABLE" };
      }
      const canonicalReference = text(
        asset.file_url || asset.url || asset.metadata?.storage_uri,
      );
      if (!canonicalReference) {
        return { asset_id: assetId, reason: "CANONICAL_FILE_REFERENCE_REQUIRED" };
      }
      return null;
    }).filter(Boolean);

    const walletAvailable = number(wallet.row?.available_balance, null);
    const walletReserved = number(wallet.row?.reserved_balance, 0);
    // WalletRuntime.reserve already deducts committed funds from available_balance.
    // Subtracting reserved_balance again would double-count reservations and can
    // incorrectly block otherwise affordable Creative executions.
    const walletSpendable = walletAvailable === null
      ? null
      : Math.max(0, walletAvailable);
    const walletCurrency = text(wallet.row?.currency).toUpperCase();
    const walletActive = Boolean(wallet.row) &&
      !["SUSPENDED", "CLOSED"].includes(text(wallet.row?.status).toUpperCase());
    const walletCurrencyMatches = Boolean(walletCurrency) &&
      walletCurrency === estimatedMaximumCostCurrency &&
      executionRequirements.every((item) => item.currency === walletCurrency);
    const walletSufficient = estimatedMaximumCost !== null &&
      walletSpendable !== null &&
      walletSpendable >= estimatedMaximumCost;

    const targetExecutionLinked = Boolean(
      publishTarget.target.service_id &&
      publishTarget.target.provider_id &&
      executionRequirements.some((item) =>
        item.service_id === publishTarget.target.service_id &&
        item.provider_id === publishTarget.target.provider_id,
      ),
    );

    const checks = [
      check("supabase_url_configured", true, configured(process.env.NEXT_PUBLIC_SUPABASE_URL)),
      check("supabase_service_role_configured", true, configured(process.env.SUPABASE_SERVICE_ROLE_KEY)),
      check("asset_bucket_configured", true, configured(assetBucket), assetBucket || null),
      check("asset_bucket_exists", true, assetBucketResult.found, assetBucketResult.error),
      check("asset_bucket_private", true, assetBucketResult.private, { bucket: assetBucket || null }),
      check("render_bucket_configured", true, configured(renderBucket), renderBucket || null),
      check("render_bucket_exists", true, renderBucketResult.found, renderBucketResult.error),
      check("render_bucket_private", true, renderBucketResult.private, { bucket: renderBucket || null }),
      check("derivative_bucket_configured", true, configured(derivativeBucket), derivativeBucket || null),
      check("derivative_bucket_exists", true, derivativeBucketResult.found, derivativeBucketResult.error),
      check("derivative_bucket_private", true, derivativeBucketResult.private, { bucket: derivativeBucket || null }),
      check("private_media_url_ttl_configured", true, number(process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS, null) > 0, process.env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS || null),
      check("asset_and_render_buckets_distinct", true, configured(assetBucket) && configured(renderBucket) && assetBucket !== renderBucket, { asset_bucket: assetBucket || null, render_bucket: renderBucket || null }),
      check("ffmpeg_path_configured", true, configured(ffmpegPath)),
      check("ffmpeg_executable", true, executable(ffmpegPath)),
      check("ffprobe_path_configured", true, configured(ffprobePath)),
      check("ffprobe_executable", true, executable(ffprobePath)),
      check("execution_requirements_supplied", true, executionRequirements.length > 0, executionRequirements),
      check("execution_requirements_complete", true, invalidExecutionRequirements.length === 0, { required: executionEvidence, invalid: invalidExecutionRequirements }),
      check("required_services_query_succeeded", true, !services.error, services.error),
      check("required_services_enabled", true, missingServices.length === 0, { required: requiredServiceIds, missing_or_disabled: missingServices }),
      check("wallet_query_succeeded", true, !wallet.error, wallet.error),
      check("wallet_active", true, walletActive, wallet.row ? { id: wallet.row.id, status: wallet.row.status, currency: wallet.row.currency } : null),
      check("estimated_maximum_cost_supplied", true, estimatedMaximumCost !== null && estimatedMaximumCost > 0, estimatedMaximumCost),
      check("estimated_maximum_cost_currency_supplied", true, Boolean(estimatedMaximumCostCurrency), estimatedMaximumCostCurrency || null),
      check("wallet_and_pricing_currency_match", true, walletCurrencyMatches, { wallet_currency: walletCurrency || null, requested_currency: estimatedMaximumCostCurrency || null, execution_currencies: executionRequirements.map((item) => item.currency) }),
      check("wallet_liquidity_sufficient", true, walletSufficient, { available_balance: walletAvailable, reserved_balance: walletReserved, spendable_balance: walletSpendable, balance_semantics: "AVAILABLE_EXCLUDES_RESERVED", estimated_maximum_cost: estimatedMaximumCost, currency: walletCurrency || null }),
      check("selected_asset_ids_supplied", true, selectedAssetIds.length > 0, selectedAssetIds),
      check("selected_assets_query_succeeded", true, !assets.error, assets.error),
      check("selected_assets_production_ready", true, invalidAssets.length === 0, { requested: selectedAssetIds, invalid: invalidAssets }),
      check("publish_target_id_supplied", true, Boolean(publishTargetId), publishTargetId || null),
      check("publish_target_valid", true, publishTarget.passed, { target: publishTarget.target, failures: publishTarget.failures }),
      check("publish_target_execution_linked", true, targetExecutionLinked, { target_service_id: publishTarget.target.service_id, target_provider_id: publishTarget.target.provider_id, required_service_ids: requiredServiceIds, required_provider_ids: requiredProviderIds }),
      check("creative_quality_policy_valid", true, creativeQuality.passed, creativeQuality),
      check("semantic_quality_policy_valid", true, semanticQuality.passed, semanticQuality),
      check("semantic_review_execution_linked", true, semanticExecutionLinked, {
        service_id: semanticQuality.policy.service_id || null,
        provider_id: semanticQuality.policy.provider_id || null,
        capability: semanticQuality.policy.capability || null,
        model: semanticQuality.policy.model || null,
      }),
      check("render_timeout_configured", false, configured(process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS)),
      check("render_cache_control_configured", false, configured(process.env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL)),
    ];

    const blocking = checks.filter((item) => item.required && !item.passed);

    return Response.json({
      success: true,
      organization_id: organizationId,
      ready: blocking.length === 0,
      checks,
      blocking_checks: blocking.map((item) => item.id),
      requested_execution: {
        execution_requirements: executionRequirements,
        required_service_ids: requiredServiceIds,
        required_provider_ids: requiredProviderIds,
        selected_asset_ids: selectedAssetIds,
        publish_target_id: publishTargetId || null,
        publish_target: publishTarget.target,
        required_media_kind: requiredMediaKind || null,
        estimated_maximum_cost: estimatedMaximumCost,
        estimated_maximum_cost_currency: estimatedMaximumCostCurrency || null,
        wallet_currency: walletCurrency || null,
        creative_quality_policy_version: text(creativeQuality.policy.version) || null,
        semantic_quality_policy_version: text(semanticQuality.policy.version) || null,
      },
      evaluated_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
