export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import fs from "node:fs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function configured(value) {
  return Boolean(String(value || "").trim());
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

function providerCredentialStore() {
  const raw = process.env.AVANTIQO_PROVIDER_CREDENTIALS_JSON;
  if (!raw) return { configured: false, valid: false, value: null };
  try {
    const value = JSON.parse(raw);
    const valid = Boolean(value && typeof value === "object" && !Array.isArray(value));
    return { configured: true, valid, value: valid ? value : null };
  } catch {
    return { configured: true, valid: false, value: null };
  }
}

function credentialConfigured(store, organizationId, providerId) {
  if (!store || !providerId) return false;
  const buckets = [
    store.organizations?.[organizationId],
    store[organizationId],
    store.providers,
    store,
  ].filter((value) => value && typeof value === "object");

  return buckets.some((bucket) => {
    const value = bucket[providerId];
    if (!value || typeof value !== "object") return false;
    const credential = value.default && typeof value.default === "object"
      ? value.default
      : value;
    return configured(credential.api_key) ||
      configured(credential.access_token) ||
      configured(credential.token) ||
      configured(credential.client_secret);
  });
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
    .select("id,organization_id,status,file_url,metadata")
    .eq("organization_id", organizationId)
    .in("id", assetIds);
  return { rows: data || [], error: error?.message || null };
}

async function queryBucket(bucket) {
  if (!configured(bucket)) return { found: false, error: null };
  const { data, error } = await supabaseAdmin.storage.getBucket(bucket);
  return { found: Boolean(data?.id), error: error?.message || null };
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

    const requiredServiceIds = list(body.required_service_ids).map(text).filter(Boolean);
    const requiredProviderIds = list(body.required_provider_ids).map((value) => text(value).toLowerCase()).filter(Boolean);
    const selectedAssetIds = list(body.selected_asset_ids).map(text).filter(Boolean);
    const estimatedMaximumCost = number(body.estimated_maximum_cost, null);
    const publishTargetId = text(body.publish_target_id);
    const assetBucket = process.env.CREATIVE_MEDIA_ASSET_BUCKET;
    const renderBucket = process.env.CREATIVE_MEDIA_RENDER_BUCKET;
    const ffmpegPath = process.env.CREATIVE_MEDIA_FFMPEG_PATH;
    const ffprobePath = process.env.CREATIVE_MEDIA_FFPROBE_PATH;
    const credentialStore = providerCredentialStore();

    const [services, wallet, assets, assetBucketResult, renderBucketResult] = await Promise.all([
      queryOrganizationServices(organizationId, requiredServiceIds),
      queryWallet(organizationId),
      querySelectedAssets(organizationId, selectedAssetIds),
      queryBucket(assetBucket),
      queryBucket(renderBucket),
    ]);

    const serviceById = new Map(services.rows.map((row) => [text(row.service_id), row]));
    const missingServices = requiredServiceIds.filter((serviceId) => {
      const row = serviceById.get(serviceId);
      if (!row) return true;
      const status = text(row.status).toUpperCase();
      return row.enabled === false || ["DISABLED", "INACTIVE", "SUSPENDED"].includes(status);
    });
    const assetIdsFound = new Set(assets.rows.map((row) => text(row.id)));
    const missingAssets = selectedAssetIds.filter((assetId) => !assetIdsFound.has(assetId));
    const walletAvailable = number(wallet.row?.available_balance, null);
    const walletActive = Boolean(wallet.row) && !["SUSPENDED", "CLOSED"].includes(text(wallet.row?.status).toUpperCase());
    const walletSufficient = estimatedMaximumCost === null
      ? false
      : walletAvailable !== null && walletAvailable >= estimatedMaximumCost;
    const missingProviderCredentials = requiredProviderIds.filter(
      (providerId) => !credentialConfigured(credentialStore.value, organizationId, providerId),
    );

    const checks = [
      check("supabase_url_configured", true, configured(process.env.NEXT_PUBLIC_SUPABASE_URL)),
      check("supabase_service_role_configured", true, configured(process.env.SUPABASE_SERVICE_ROLE_KEY)),
      check("asset_bucket_configured", true, configured(assetBucket), assetBucket || null),
      check("asset_bucket_exists", true, assetBucketResult.found, assetBucketResult.error),
      check("render_bucket_configured", true, configured(renderBucket), renderBucket || null),
      check("render_bucket_exists", true, renderBucketResult.found, renderBucketResult.error),
      check("ffmpeg_path_configured", true, configured(ffmpegPath)),
      check("ffmpeg_executable", true, executable(ffmpegPath)),
      check("ffprobe_path_configured", true, configured(ffprobePath)),
      check("ffprobe_executable", true, executable(ffprobePath)),
      check("provider_credential_store_configured", true, credentialStore.configured),
      check("provider_credential_store_valid", true, credentialStore.valid),
      check("required_provider_ids_supplied", true, requiredProviderIds.length > 0, requiredProviderIds),
      check("required_provider_credentials_present", true, missingProviderCredentials.length === 0, { required: requiredProviderIds, missing: missingProviderCredentials }),
      check("required_service_ids_supplied", true, requiredServiceIds.length > 0, requiredServiceIds),
      check("required_services_query_succeeded", true, !services.error, services.error),
      check("required_services_enabled", true, missingServices.length === 0, { required: requiredServiceIds, missing_or_disabled: missingServices }),
      check("wallet_query_succeeded", true, !wallet.error, wallet.error),
      check("wallet_active", true, walletActive, wallet.row ? { id: wallet.row.id, status: wallet.row.status, currency: wallet.row.currency } : null),
      check("estimated_maximum_cost_supplied", true, estimatedMaximumCost !== null && estimatedMaximumCost >= 0, estimatedMaximumCost),
      check("wallet_liquidity_sufficient", true, walletSufficient, { available_balance: walletAvailable, estimated_maximum_cost: estimatedMaximumCost, currency: wallet.row?.currency || null }),
      check("selected_asset_ids_supplied", true, selectedAssetIds.length > 0, selectedAssetIds),
      check("selected_assets_query_succeeded", true, !assets.error, assets.error),
      check("selected_assets_organization_scoped", true, missingAssets.length === 0, { requested: selectedAssetIds, missing: missingAssets }),
      check("publish_target_id_supplied", true, Boolean(publishTargetId), publishTargetId || null),
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
        required_service_ids: requiredServiceIds,
        required_provider_ids: requiredProviderIds,
        selected_asset_ids: selectedAssetIds,
        publish_target_id: publishTargetId || null,
        estimated_maximum_cost: estimatedMaximumCost,
        wallet_currency: wallet.row?.currency || null,
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
