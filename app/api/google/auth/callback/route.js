export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getOAuthClient } from "@/lib/integrations/googleAuth";
import { discoverAndRegisterGoogleBusinessLocations } from "@/lib/commercial/reputation/googleBusinessProfile";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const RETRY_DELAY_MS = 15 * 60 * 1000;
const INTEGRATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function clearOauthCookies(response) {
  response.cookies.delete("google_oauth_state");
  response.cookies.delete("google_oauth_organization_id");
  response.cookies.delete("google_oauth_origin");
  response.cookies.delete("google_oauth_purpose");
  return response;
}

function redirectToAdministration(
  origin,
  organizationId,
  status,
  message = null,
  purpose = "google_business"
) {
  const url = new URL("/settings/integrations", origin);
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set(
    purpose === "google_ads" ? "googleAds" : "google",
    status
  );
  if (message) url.searchParams.set("message", message.slice(0, 220));
  return url;
}

function isQuotaError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 429 ||
    message.includes("quota exceeded") ||
    message.includes("rate limit") ||
    message.includes("resource_exhausted")
  );
}

function canManageIntegrations(access) {
  const roles = [
    access?.role,
    access?.access?.role,
    access?.membership?.role,
    access?.staff?.role,
  ]
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  return roles.some((role) => INTEGRATION_ROLES.has(role));
}

async function ensureOrganizationService({ organizationId, serviceId }) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: serviceId,
  }).catch(() => null);

  if (existing && String(existing.status || "").toUpperCase() === "ACTIVE") {
    return existing;
  }

  const googleAds = serviceId === "google-ads";
  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "marketing-social",
    service_id: serviceId,
    package_id: existing?.package_id || (googleAds ? "growth" : "core"),
    status: "ACTIVE",
    managed_by: existing?.managed_by || "avantiqo",
    authorization_required: true,
    usage_enabled: true,
    billing_enabled: true,
    billing_mode: googleAds ? "PREPAID_MANAGED_MEDIA" : "USAGE",
    pricing_mode: "PROVIDER",
    fallback_enabled: googleAds ? true : Boolean(existing?.fallback_enabled),
    activated_at: existing?.activated_at || new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      provider: googleAds ? "google_ads" : "google",
      connection_model: googleAds
        ? "ORGANIZATION_OAUTH_WITH_MANAGED_MEDIA_SPEND"
        : "ORGANIZATION_OAUTH",
    },
    configuration: existing?.configuration || {},
  });
}

async function recordAuthorization({
  connection,
  organizationId,
  authorizingPartyId,
  authorizedAt,
}) {
  const { error } = await supabaseAdmin
    .from("organization_channel_connections")
    .update({
      authorized_by_party_id: authorizingPartyId,
      authorized_at: authorizedAt,
      updated_at: authorizedAt,
    })
    .eq("id", connection.id)
    .eq("organization_id", organizationId);

  if (error) throw error;
}

async function connectGoogleAds({ access, tokens, authorizingPartyId, authorizedAt }) {
  const credential = await CredentialRuntime.store({
    provider_id: "google_ads",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(tokens),
    metadata: {
      organization_id: access.organizationId,
      party_id: authorizingPartyId,
      scopes: tokens.scope || null,
      purpose: "GOOGLE_ADS_MANAGEMENT",
    },
  });

  const connection = await ChannelConnectionRuntime.connect({
    organization_id: access.organizationId,
    provider: "google_ads",
    channel_type: "advertising",
    credentials_reference: credential.id,
    metadata: {
      scopes: tokens.scope || null,
      account_discovery_status: "PENDING",
      account_count: 0,
      developer_token_managed_by: "AVANTIQO",
    },
  });

  await recordAuthorization({
    connection,
    organizationId: access.organizationId,
    authorizingPartyId,
    authorizedAt,
  });
  await ensureOrganizationService({
    organizationId: access.organizationId,
    serviceId: "google-ads",
  });

  return connection;
}

async function connectGoogleBusiness({ access, tokens, authorizingPartyId, authorizedAt }) {
  const credential = await CredentialRuntime.store({
    provider_id: "google",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(tokens),
    metadata: {
      organization_id: access.organizationId,
      party_id: authorizingPartyId,
      scopes: tokens.scope || null,
      purpose: "GOOGLE_BUSINESS_PROFILE_REVIEWS",
    },
  });

  const connection = await ChannelConnectionRuntime.connect({
    organization_id: access.organizationId,
    provider: "google",
    channel_type: "business-profile",
    credentials_reference: credential.id,
    metadata: {
      scopes: tokens.scope || null,
      location_count: 0,
      location_discovery_status: "PENDING",
      location_discovery_error: null,
      location_discovery_retry_at: null,
    },
  });

  await recordAuthorization({
    connection,
    organizationId: access.organizationId,
    authorizingPartyId,
    authorizedAt,
  });
  await ensureOrganizationService({
    organizationId: access.organizationId,
    serviceId: "google-business",
  });

  return connection;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const configuredOrigin = new URL(
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || requestUrl.origin
  ).origin;
  const origin =
    request.cookies.get("google_oauth_origin")?.value || configuredOrigin;
  const organizationId = request.cookies.get(
    "google_oauth_organization_id"
  )?.value;
  const purpose =
    request.cookies.get("google_oauth_purpose")?.value === "google_ads"
      ? "google_ads"
      : "google_business";
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const savedState = request.cookies.get("google_oauth_state")?.value;
  const oauthError = requestUrl.searchParams.get("error");

  try {
    if (!organizationId) {
      throw new Error("Organization context expired. Start the connection again.");
    }
    if (oauthError) {
      throw new Error(`Google connection was not approved: ${oauthError}`);
    }
    if (!code || !state || state !== savedState) {
      throw new Error("Google connection validation failed or expired");
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      throw new Error(access.error || "Organization access denied");
    }
    if (!canManageIntegrations(access)) {
      throw new Error(
        "Owner, administrator, or manager access is required to connect Google services"
      );
    }

    const oauth2Client = getOAuthClient({ origin });
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }

    const authorizedAt = new Date().toISOString();
    const authorizingPartyId = access.staff?.party_id || null;

    if (purpose === "google_ads") {
      await connectGoogleAds({
        access,
        tokens,
        authorizingPartyId,
        authorizedAt,
      });

      const response = NextResponse.redirect(
        redirectToAdministration(
          origin,
          access.organizationId,
          "connected",
          "Google Ads connected. Discover and map the organization’s accessible Ads accounts before campaign execution.",
          purpose
        )
      );
      return clearOauthCookies(response);
    }

    const connection = await connectGoogleBusiness({
      access,
      tokens,
      authorizingPartyId,
      authorizedAt,
    });

    let status = "connected";
    let message = "Google Business Profile connected.";

    try {
      await discoverAndRegisterGoogleBusinessLocations({
        organizationId: access.organizationId,
        connection,
      });
      message = "Google Business Profile connected and locations discovered.";
    } catch (discoveryError) {
      const quota = isQuotaError(discoveryError);
      const attemptedAt = new Date().toISOString();
      const retryAt = quota
        ? new Date(Date.now() + RETRY_DELAY_MS).toISOString()
        : null;

      console.warn("GOOGLE_BUSINESS_LOCATION_DISCOVERY_PENDING", {
        organization_id: access.organizationId,
        error: discoveryError?.message || "Location discovery failed",
        quota,
      });

      const { error: discoveryStateError } = await supabaseAdmin
        .from("organization_channel_connections")
        .update({
          metadata: {
            ...(connection.metadata || {}),
            location_count: 0,
            location_discovery_status: quota ? "RATE_LIMITED" : "PENDING",
            location_discovery_error: String(
              discoveryError?.message || "Location discovery failed"
            ).slice(0, 500),
            location_discovery_attempted_at: attemptedAt,
            location_discovery_retry_at: retryAt,
          },
          updated_at: attemptedAt,
        })
        .eq("id", connection.id)
        .eq("organization_id", access.organizationId);
      if (discoveryStateError) throw discoveryStateError;

      status = quota ? "rate-limited" : "connected-pending";
      message = quota
        ? "Google is connected. Location discovery hit a temporary Google quota limit; the authorization is safe and can be retried from Administration."
        : "Google is connected. Location discovery is still pending and can be retried from Administration.";
    }

    const response = NextResponse.redirect(
      redirectToAdministration(
        origin,
        access.organizationId,
        status,
        message,
        purpose
      )
    );
    return clearOauthCookies(response);
  } catch (error) {
    const response = NextResponse.redirect(
      redirectToAdministration(
        origin,
        organizationId || "unknown",
        "error",
        error?.message || "Google connection failed",
        purpose
      )
    );
    return clearOauthCookies(response);
  }
}
