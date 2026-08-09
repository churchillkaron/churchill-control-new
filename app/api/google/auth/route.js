export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getOAuthClient } from "@/lib/integrations/googleAuth";
import { GOOGLE_BUSINESS_SCOPE } from "@/lib/commercial/reputation/googleBusinessProfile";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function applicationOrigin(requestUrl) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || requestUrl.origin;
  return new URL(configured).origin;
}

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);
    const organizationId =
      requestUrl.searchParams.get("organizationId") ||
      requestUrl.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error || "Organization access denied",
        },
        { status: access.status || 403 }
      );
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google OAuth application credentials are not configured");
    }

    const origin = applicationOrigin(requestUrl);
    const state = crypto.randomUUID();
    const oauth2Client = getOAuthClient({ origin });
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      state,
      scope: [
        GOOGLE_BUSINESS_SCOPE,
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
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Google auth failed",
      },
      { status: 500 }
    );
  }
}
