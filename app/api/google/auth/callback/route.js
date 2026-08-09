export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getOAuthClient } from "@/lib/integrations/googleAuth";
import { discoverAndRegisterGoogleBusinessLocations } from "@/lib/commercial/reputation/googleBusinessProfile";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

function clearOauthCookies(response) {
  response.cookies.delete("google_oauth_state");
  response.cookies.delete("google_oauth_organization_id");
  response.cookies.delete("google_oauth_origin");
  return response;
}

function redirectToReviews(origin, organizationId, status, message = null) {
  const url = new URL(
    `/workspace/${organizationId}/commercial/reviews`,
    origin
  );
  url.searchParams.set("google", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return url;
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
    if (oauthError) throw new Error(`Google connection was not approved: ${oauthError}`);
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

    const oauth2Client = getOAuthClient({ origin });
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }

    const credential = await CredentialRuntime.store({
      provider_id: "google",
      credential_type: "oauth_token",
      secret_reference: JSON.stringify(tokens),
      metadata: {
        organization_id: access.organizationId,
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
      },
    });

    let status = "connected";
    let message = null;

    try {
      await discoverAndRegisterGoogleBusinessLocations({
        organizationId: access.organizationId,
        connection,
        accessToken: tokens.access_token,
      });
    } catch (discoveryError) {
      console.warn("GOOGLE_BUSINESS_LOCATION_DISCOVERY_PENDING", {
        organization_id: access.organizationId,
        error: discoveryError?.message || "Location discovery failed",
      });

      await ChannelConnectionRuntime.connect({
        organization_id: access.organizationId,
        provider: "google",
        channel_type: "business-profile",
        credentials_reference: credential.id,
        metadata: {
          ...(connection.metadata || {}),
          location_count: 0,
          location_discovery_status: "PENDING",
          location_discovery_error: String(
            discoveryError?.message || "Location discovery failed"
          ).slice(0, 500),
          location_discovery_attempted_at: new Date().toISOString(),
        },
      });

      status = "connected-pending";
      message =
        "Google account connected. Business Profile access is awaiting Google API approval.";
    }

    const response = NextResponse.redirect(
      redirectToReviews(origin, access.organizationId, status, message)
    );
    return clearOauthCookies(response);
  } catch (error) {
    const response = NextResponse.redirect(
      redirectToReviews(
        origin,
        organizationId || "unknown",
        "error",
        error?.message || "Google connection failed"
      )
    );
    return clearOauthCookies(response);
  }
}
