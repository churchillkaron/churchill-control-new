export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function graphVersion() {
  const configured = String(process.env.META_GRAPH_API_VERSION || "").trim();
  if (!configured) throw new Error("META_GRAPH_API_VERSION is not configured");
  return configured.startsWith("v") ? configured : `v${configured}`;
}

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);
    const organizationId = requestUrl.searchParams.get("organizationId");
    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "marketing.ads.manage",
    });

    if (!access.success) {
      throw new Error(access.error || "Organization access denied");
    }
    if (!process.env.META_APP_ID) {
      throw new Error("META_APP_ID is not configured");
    }

    const state = crypto.randomUUID();
    const origin = requestUrl.origin;
    const callbackUrl = `${origin}/api/meta/auth/callback`;
    const authUrl = new URL(
      `https://www.facebook.com/${graphVersion()}/dialog/oauth`
    );

    authUrl.searchParams.set("client_id", process.env.META_APP_ID);
    authUrl.searchParams.set("redirect_uri", callbackUrl);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set(
      "scope",
      [
        "pages_show_list",
        "pages_read_engagement",
        "business_management",
        "instagram_basic",
        "instagram_content_publish",
      ].join(",")
    );

    const response = NextResponse.redirect(authUrl.toString());
    const cookieOptions = {
      httpOnly: true,
      secure: requestUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    };

    response.cookies.set("meta_oauth_state", state, cookieOptions);
    response.cookies.set(
      "meta_oauth_organization_id",
      access.organizationId,
      cookieOptions
    );
    response.cookies.set("meta_oauth_origin", origin, cookieOptions);

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Meta auth failed",
      },
      { status: error?.status || 500 }
    );
  }
}
