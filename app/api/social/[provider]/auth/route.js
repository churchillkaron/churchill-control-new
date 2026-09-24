export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  buildSocialAuthorizationUrl,
  createPkcePair,
  getSocialOAuthConfig,
} from "@/lib/platform/channels/oauth/SocialOAuthRuntime";

const MANAGER_ROLES = new Set([
  "OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER",
  "SUPER_ADMIN", "ADMIN", "MANAGER",
]);

function text(value) { return String(value ?? "").trim(); }
function providerName(value) { return text(value).toLowerCase(); }
function canManage(access) {
  return [access?.role, access?.access?.role, access?.membership?.role, access?.staff?.role]
    .map((value) => text(value).toUpperCase())
    .some((role) => MANAGER_ROLES.has(role));
}

export async function GET(request, { params }) {
  try {
    const resolvedParams = await params;
    const provider = providerName(resolvedParams?.provider);
    const config = getSocialOAuthConfig(provider);
    if (!config) {
      return NextResponse.json({ success:false, error:"Unsupported social connection" }, { status:404 });
    }

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success:false, error:access.error || "Organization access denied" }, { status:access.status || 403 });
    }
    if (!canManage(access)) {
      return NextResponse.json({ success:false, error:"Owner, administrator, or manager access is required to connect social channels" }, { status:403 });
    }

    const clientId = text(process.env[config.clientIdEnv]);
    const clientSecret = config.clientSecretEnv ? text(process.env[config.clientSecretEnv]) : "";
    if (!clientId || (config.clientSecretEnv && provider !== "x" && !clientSecret)) {
      return NextResponse.json({ success:false, error:`${provider} OAuth is not configured by Avantiqo yet` }, { status:503 });
    }

    const returnPath = url.searchParams.get("onboarding") === "1"
      ? `/workspace/${encodeURIComponent(access.organizationId)}/administration/communications-setup?onboarding=1`
      : null;
    const pkce = config.pkce ? createPkcePair() : null;
    const { state } = await createOAuthAuthorization({
      provider,
      purpose: `organization_${provider}_connection`,
      organizationId: access.organizationId,
      partyId: access.staff?.party_id || null,
      returnOrigin: url.origin,
      metadata: {
        user_id: access.userId || null,
        ...(returnPath ? { return_path:returnPath } : {}),
        ...(pkce?.verifier ? { pkce_verifier:pkce.verifier } : {}),
      },
    });

    const authorize = buildSocialAuthorizationUrl({
      provider,
      state,
      codeChallenge: pkce?.challenge || null,
    });
    return NextResponse.redirect(authorize);
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Social authorization failed" }, { status:500 });
  }
}
