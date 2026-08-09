export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getOAuthClient } from "@/lib/integrations/googleAuth";
import { discoverAndRegisterGoogleBusinessLocations } from "@/lib/commercial/reputation/googleBusinessProfile";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
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
  return response;
}

function redirectToAdministration(origin, organizationId, status, message = null) {
  const url = new URL("/settings/integrations", origin);
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("google", status);
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

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });
    if (!access.success) {
      throw new Error(access.error || "Organization access denied");
    }
    if (!canManageIntegrations(access)) {
      throw new Error(
        "Owner, administrator, or manager access is required to connect Google Business Profile"
      );
    }

    const oauth2Client = getOAuthClient({ origin });
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }

    const authorizedAt = new Date().toISOString();
    const authorizingPartyId = access.staff?.party_id || null;

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

    const { error: authorizationError } = await supabaseAdmin
      .from("organization_channel_connections")
      .update({
        authorized_by_party_id: authorizingPartyId,
        authorized_at: authorizedAt,
        updated_at: authorizedAt,
      })
      .eq("id", connection.id)
      .eq("organization_id", access.organizationId);
    if (authorizationError) throw authorizationError;

    let status = "connected";
    let message = "Google Business Profile connected.";

    try {
      await discoverAndRegisterGoogleBusinessLocations({
        organizationId: access.organizationId,
        connection,
        accessToken: tokens.access_token,
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
      redirectToAdministration(origin, access.organizationId, status, message)
    );
    return clearOauthCookies(response);
  } catch (error) {
    const response = NextResponse.redirect(
      redirectToAdministration(
        origin,
        organizationId || "unknown",
        "error",
        error?.message || "Google connection failed"
      )
    );
    return clearOauthCookies(response);
  }
}
