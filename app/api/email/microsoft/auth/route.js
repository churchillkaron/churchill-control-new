export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function callbackOrigin() {
  return new URL(process.env.MICROSOFT_EMAIL_OAUTH_CALLBACK_ORIGIN || "https://avantiqo.ai").origin;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      return NextResponse.json({ success: false, error: "Microsoft mailbox connection is not configured by Avantiqo yet" }, { status: 503 });
    }

    const { state } = await createOAuthAuthorization({
      provider: "email_microsoft",
      purpose: "business_mailbox",
      organizationId: access.organizationId,
      partyId: access.staff?.party_id || null,
      returnOrigin: url.origin,
      metadata: { user_id: access.userId || null },
    });

    const tenant = String(process.env.MICROSOFT_TENANT_ID || "common").trim();
    const authorize = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
    authorize.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("redirect_uri", `${callbackOrigin()}/api/email/microsoft/auth/callback`);
    authorize.searchParams.set("response_mode", "query");
    authorize.searchParams.set("scope", "offline_access User.Read Mail.ReadWrite Mail.Send");
    authorize.searchParams.set("state", state);
    return NextResponse.redirect(authorize);
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Microsoft mailbox authorization failed" }, { status: 500 });
  }
}
