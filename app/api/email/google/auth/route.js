export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { google } from "googleapis";
import { NextResponse } from "next/server";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function callbackOrigin() {
  return new URL(
    process.env.GOOGLE_EMAIL_OAUTH_CALLBACK_ORIGIN ||
      process.env.GOOGLE_OAUTH_CALLBACK_ORIGIN ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://avantiqo.ai",
  ).origin;
}

function client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${callbackOrigin()}/api/email/google/auth/callback`,
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json({ success: false, error: "Google mailbox connection is not configured by Avantiqo yet" }, { status: 503 });
    }

    const { state } = await createOAuthAuthorization({
      provider: "email_google",
      purpose: "business_mailbox",
      organizationId: access.organizationId,
      partyId: access.staff?.party_id || null,
      returnOrigin: url.origin,
      metadata: { user_id: access.userId || null },
    });

    const authUrl = client().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      state,
      scope: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
    });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Google mailbox authorization failed" }, { status: 500 });
  }
}
