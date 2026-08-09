export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  getGoogleOAuthCallbackOrigin,
  getOAuthClient,
} from "@/lib/integrations/googleAuth";
import { resolveRegisteredPlatformHostContext } from "@/lib/platform/context/resolveRegisteredPlatformHostContext";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const INTEGRATION_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

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

function administrationRedirect(origin, organizationId, message) {
  const url = new URL("/settings/integrations", origin);
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("googleAds", "connected");
  url.searchParams.set("message", message);
  return url;
}

async function validatedReturnOrigin(requestUrl, organizationId) {
  const hostname = requestUrl.hostname.toLowerCase();
  const context = await resolveRegisteredPlatformHostContext(hostname);
  const platformHost =
    hostname === "avantiqo.ai" ||
    hostname === "www.avantiqo.ai" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".vercel.app");

  if (context.organizationId && context.organizationId !== organizationId) {
    throw new Error("Hostname does not belong to this organization");
  }

  if (!context.organizationId && !platformHost) {
    throw new Error("Hostname is not registered for this organization");
  }

  return requestUrl.origin;
}

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);
    const organizationId =
      requestUrl.searchParams.get("organizationId") ||
      requestUrl.searchParams.get("organization_id");
    const reconnect =
      requestUrl.searchParams.get("reconnect") === "true" ||
      requestUrl.searchParams.get("reconnect") === "1";

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Organization access denied" },
        { status: access.status || 403 }
      );
    }

    if (!canManageIntegrations(access)) {
      return NextResponse.json(
        {
          success: false,
          error: "Owner, administrator, or manager access is required to connect Google Ads",
        },
        { status: 403 }
      );
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google OAuth application credentials are not configured");
    }

    const { data: existingConnection, error: connectionError } = await supabaseAdmin
      .from("organization_channel_connections")
      .select("id,status")
      .eq("organization_id", access.organizationId)
      .eq("provider", "google_ads")
      .maybeSingle();
    if (connectionError) throw connectionError;

    const returnOrigin = await validatedReturnOrigin(
      requestUrl,
      access.organizationId
    );

    if (
      existingConnection &&
      String(existingConnection.status || "").toUpperCase() === "ACTIVE" &&
      !reconnect
    ) {
      return NextResponse.redirect(
        administrationRedirect(
          returnOrigin,
          access.organizationId,
          "Google Ads is already connected. The existing authorization was left unchanged."
        )
      );
    }

    const { state } = await createOAuthAuthorization({
      provider: "google",
      purpose: "google_ads",
      organizationId: access.organizationId,
      partyId: access.staff?.party_id || null,
      returnOrigin,
      metadata: {
        user_id: access.userId || null,
        staff_account_id: access.staff?.id || null,
        role: access.role || null,
      },
    });

    const oauth2Client = getOAuthClient({
      origin: getGoogleOAuthCallbackOrigin(),
    });
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      state,
      scope: [
        GOOGLE_ADS_SCOPE,
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Google Ads auth failed" },
      { status: 500 }
    );
  }
}
