export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  buildSocialAuthorizationUrl,
  createPkcePair,
  getSocialOAuthConfig,
} from "@/lib/platform/channels/oauth/SocialOAuthRuntime";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const MANAGER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
]);

function canManage(access) {
  return [access?.role, access?.access?.role, access?.membership?.role, access?.staff?.role]
    .map((value) => String(value || "").trim().toUpperCase())
    .some((role) => MANAGER_ROLES.has(role));
}

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const provider = String(resolved?.provider || "").trim().toLowerCase();
    const config = getSocialOAuthConfig(provider);
    if (!config) {
      return NextResponse.json({ success: false, error: "Unsupported social connection" }, { status: 404 });
    }

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }
    if (!canManage(access)) {
      return NextResponse.json({ success: false, error: "Owner, administrator, or manager access is required to connect this service" }, { status: 403 });
    }

    let pkce = null;
    if (config.pkce) pkce = createPkcePair();

    const { state } = await createOAuthAuthorization({
      provider,
      purpose: "organization_social_connection",
      organizationId: access.organizationId,
      partyId: access.staff?.party_id || null,
      returnOrigin: url.origin,
      metadata: {
        provider,
        user_id: access.userId || null,
        code_verifier: pkce?.verifier || null,
      },
    });

    const authorizationUrl = buildSocialAuthorizationUrl({
      provider,
      state,
      codeChallenge: pkce?.challenge || null,
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Social authorization failed" },
      { status: 500 },
    );
  }
}
