export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  getGoogleOAuthCallbackOrigin,
  getOAuthClient,
} from "@/lib/integrations/googleAuth";
import { discoverAndRegisterGoogleBusinessLocations } from "@/lib/commercial/reputation/googleBusinessProfile";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const RETRY_DELAY_MS = 15 * 60 * 1000;

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

async function connectGoogleAds({ organizationId, tokens, authorizingPartyId, authorizedAt }) {
  const credential = await CredentialRuntime.store({
    provider_id: "google_ads",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(tokens),
    metadata: {
      organization_id: organizationId,
      party_id: authorizingPartyId,
      scopes: tokens.scope || null,
      purpose: "GOOGLE_ADS_MANAGEMENT",
    },
  });

  const connection = await ChannelConnectionRuntime.connect({
    organization_id: organizationId,
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
    organizationId,
    authorizingPartyId,
    authorizedAt,
  });
  await ensureOrganizationService({
    organizationId,
    serviceId: "google-ads",
  });

  return connection;
}

async function connectGoogleBusiness({ organizationId, tokens, authorizingPartyId, authorizedAt }) {
  const credential = await CredentialRuntime.store({
    provider_id: "google",
    credential_type: "oauth_token",
    secret_reference: JSON.stringify(tokens),
    metadata: {
      organization_id: organizationId,
      party_id: authorizingPartyId,
      scopes: tokens.scope || null,
      purpose: "GOOGLE_BUSINESS_PROFILE_REVIEWS",
    },
  });

  const connection = await ChannelConnectionRuntime.connect({
    organization_id: organizationId,
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
    organizationId,
    authorizingPartyId,
    authorizedAt,
  });
  await ensureOrganizationService({
    organizationId,
    serviceId: "google-business",
  });

  return connection;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  let authorization = null;

  try {
    if (!state) {
      throw new Error("Google connection validation failed or expired");
    }

    authorization = await consumeOAuthAuthorization({
      state,
      provider: "google",
    });

    const organizationId = authorization.organization_id;
    const purpose =
      authorization.purpose === "google_ads" ? "google_ads" : "google_business";
    const returnOrigin = authorization.return_origin;

    if (oauthError) {
      throw new Error(`Google connection was not approved: ${oauthError}`);
    }
    if (!code) {
      throw new Error("Google did not return an authorization code");
    }

    const oauth2Client = getOAuthClient({
      origin: getGoogleOAuthCallbackOrigin(),
    });
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }

    const authorizedAt = new Date().toISOString();
    const authorizingPartyId = authorization.party_id || null;

    if (purpose === "google_ads") {
      await connectGoogleAds({
        organizationId,
        tokens,
        authorizingPartyId,
        authorizedAt,
      });

      return NextResponse.redirect(
        redirectToAdministration(
          returnOrigin,
          organizationId,
          "connected",
          "Google Ads connected. Discover and map the organization’s accessible Ads accounts before campaign execution.",
          purpose
        )
      );
    }

    const connection = await connectGoogleBusiness({
      organizationId,
      tokens,
      authorizingPartyId,
      authorizedAt,
    });

    let status = "connected";
    let message = "Google Business Profile connected.";

    try {
      await discoverAndRegisterGoogleBusinessLocations({
        organizationId,
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
        organization_id: organizationId,
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
        .eq("organization_id", organizationId);
      if (discoveryStateError) throw discoveryStateError;

      status = quota ? "rate-limited" : "connected-pending";
      message = quota
        ? "Google is connected. Location discovery hit a temporary Google quota limit; the authorization is safe and can be retried from Administration."
        : "Google is connected. Location discovery is still pending and can be retried from Administration.";
    }

    return NextResponse.redirect(
      redirectToAdministration(
        returnOrigin,
        organizationId,
        status,
        message,
        purpose
      )
    );
  } catch (error) {
    const fallbackOrigin =
      authorization?.return_origin || getGoogleOAuthCallbackOrigin();
    const organizationId = authorization?.organization_id || "unknown";
    const purpose =
      authorization?.purpose === "google_ads" ? "google_ads" : "google_business";

    return NextResponse.redirect(
      redirectToAdministration(
        fallbackOrigin,
        organizationId,
        "error",
        error?.message || "Google connection failed",
        purpose
      )
    );
  }
}
