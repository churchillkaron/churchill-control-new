export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getOAuthClient } from "@/lib/integrations/googleAuth";
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

function applicationOrigin(requestUrl) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || requestUrl.origin;
  return new URL(configured).origin;
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

function administrationRedirect(origin, organizationId, message) {
  const url = new URL("/settings/integrations", origin);
  url.searchParams.set("organizationId", organizationId);
  url.searchParams.set("googleAds", "connected");
  url.searchParams.set("message", message);
  return url;
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

    const origin = applicationOrigin(requestUrl);
    if (
      existingConnection &&
      String(existingConnection.status || "").toUpperCase() === "ACTIVE" &&
      !reconnect
    ) {
      return NextResponse.redirect(
        administrationRedirect(
          origin,
          access.organizationId,
          "Google Ads is already connected. The existing authorization was left unchanged."
        )
      );
    }

    const state = crypto.randomUUID();
    const oauth2Client = getOAuthClient({ origin });
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
    const response = NextResponse.redirect(authUrl);
    const cookieOptions = {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    };

    response.cookies.set("google_oauth_state", state, cookieOptions);
    response.cookies.set(
      "google_oauth_organization_id",
      access.organizationId,
      cookieOptions
    );
    response.cookies.set("google_oauth_origin", origin, cookieOptions);
    response.cookies.set("google_oauth_purpose", "google_ads", cookieOptions);
    return response;
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Google Ads auth failed" },
      { status: 500 }
    );
  }
}
