export const dynamic = "force-dynamic";

import { withApiHandler } from "@/lib/shared/http/withApiHandler";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveProviderCredential } from "@/lib/platform/service-runtime/providers/ProviderCredentialRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import "@/lib/platform/service-runtime/providers/google/GoogleCredentialRegistration";

function text(value) {
  return String(value ?? "").trim();
}

function digits(value) {
  return text(value).replace(/\D/g, "");
}

function safeSearch(value) {
  return text(value)
    .replace(/[^\p{L}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function accountAsset({ organizationId, assetId }) {
  const { data, error } = await supabaseAdmin
    .from("organization_channel_assets")
    .select("id,organization_id,channel_provider,asset_type,external_id,metadata")
    .eq("id", assetId)
    .eq("organization_id", organizationId)
    .eq("channel_provider", "google_ads")
    .eq("asset_type", "google_ads_customer")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const error = new Error("Google Ads account is not available for this organization");
    error.status = 400;
    throw error;
  }
  if (data.metadata?.manager === true) {
    const error = new Error("Google Ads manager accounts cannot be used for campaign targeting lookup");
    error.status = 400;
    throw error;
  }
  return data;
}

async function googleAdsSearch({ accessToken, developerToken, customerId, loginCustomerId, query }) {
  const apiVersion = text(process.env.GOOGLE_ADS_API_VERSION) || "v25";
  const response = await fetch(
    `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({ query }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Google Ads targeting lookup failed (${response.status})`);
    error.status = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }
  return payload;
}

export const GET = withApiHandler("marketing-google-ads-targeting-search", async (request) => {
  const url = new URL(request.url);
  const access = await requireOrganizationAccess({
    organizationId: url.searchParams.get("organizationId"),
    request,
    requiredPermission: "marketing.ads.manage",
  });
  if (!access.success) {
    const error = new Error(access.error || "Organization access denied");
    error.status = access.status || 403;
    throw error;
  }

  const assetId = text(url.searchParams.get("accountAssetId"));
  const type = text(url.searchParams.get("type")).toLowerCase();
  const q = safeSearch(url.searchParams.get("q"));
  if (!assetId) {
    const error = new Error("Select a Google Ads account first");
    error.status = 400;
    throw error;
  }
  if (q.length < 2) return { type, results: [] };

  const asset = await accountAsset({ organizationId: access.organizationId, assetId });
  const customerId = digits(asset.metadata?.customer_id || asset.external_id);
  if (!customerId) {
    const error = new Error("Google Ads customer id is missing");
    error.status = 400;
    throw error;
  }

  const credential = await resolveProviderCredential({
    organization_id: access.organizationId,
    provider: "google_ads",
  });
  const accessToken = credential?.access_token;
  const developerToken = text(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  if (!accessToken || !developerToken) {
    const error = new Error("Google Ads managed credential is not ready");
    error.status = 400;
    throw error;
  }
  const loginCustomerId = digits(credential?.login_customer_id || asset.metadata?.login_customer_id);
  const escaped = q.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  if (type === "location") {
    const payload = await googleAdsSearch({
      accessToken,
      developerToken,
      customerId,
      loginCustomerId,
      query: `SELECT geo_target_constant.resource_name, geo_target_constant.id, geo_target_constant.name, geo_target_constant.country_code, geo_target_constant.target_type, geo_target_constant.status FROM geo_target_constant WHERE geo_target_constant.name LIKE '%${escaped}%' AND geo_target_constant.status = 'ENABLED' LIMIT 25`,
    });
    return {
      type,
      results: (payload.results || []).map((row) => row.geoTargetConstant).filter(Boolean).map((row) => ({
        id: text(row.id),
        resource_name: text(row.resourceName),
        name: text(row.name),
        country_code: text(row.countryCode).toUpperCase() || null,
        target_type: text(row.targetType) || null,
      })).filter((row) => row.id && row.resource_name),
    };
  }

  if (type === "language") {
    const payload = await googleAdsSearch({
      accessToken,
      developerToken,
      customerId,
      loginCustomerId,
      query: `SELECT language_constant.resource_name, language_constant.id, language_constant.name, language_constant.code, language_constant.targetable FROM language_constant WHERE language_constant.name LIKE '%${escaped}%' AND language_constant.targetable = TRUE LIMIT 25`,
    });
    return {
      type,
      results: (payload.results || []).map((row) => row.languageConstant).filter(Boolean).map((row) => ({
        id: text(row.id),
        resource_name: text(row.resourceName),
        name: text(row.name),
        code: text(row.code) || null,
      })).filter((row) => row.id && row.resource_name),
    };
  }

  const error = new Error("Unsupported Google Ads targeting lookup type");
  error.status = 400;
  throw error;
});
