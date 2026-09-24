export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import {
  existingMetaPreferredPageId,
  fetchMetaMessagingPages,
  finalizeMetaOrganizationConnection,
} from "@/lib/platform/channels/meta/MetaOrganizationConnectionRuntime";

function text(value) { return String(value ?? "").trim(); }
function graphVersion() {
  const configured = text(process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0");
  return configured.startsWith("v") ? configured : `v${configured}`;
}
function clearOauthCookies(response) {
  response.cookies.delete("meta_oauth_state");
  response.cookies.delete("meta_oauth_organization_id");
  response.cookies.delete("meta_oauth_origin");
  response.cookies.delete("meta_oauth_return_path");
  return response;
}
function safeReturnPath(returnPath, organizationId) {
  const allowed = `/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`;
  return text(returnPath) === allowed
    ? allowed
    : `/workspace/${encodeURIComponent(organizationId)}/administration/integrations#meta`;
}
function resultUrl(origin, organizationId, status, message = null, returnPath = null) {
  const url = new URL(safeReturnPath(returnPath, organizationId), origin);
  url.searchParams.set("meta", status);
  if (message) url.searchParams.set("message", text(message).slice(0, 180));
  return url;
}
async function exchangeAuthorizationCode({code,origin}) {
  const callbackUrl = `${origin}/api/meta/auth/callback`;
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
  url.searchParams.set("client_id", process.env.META_APP_ID || "");
  url.searchParams.set("client_secret", process.env.META_APP_SECRET || "");
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("code", code);
  const response = await fetch(url,{cache:"no-store"});
  const payload = await response.json().catch(()=>({}));
  if(!response.ok || !payload?.access_token) throw new Error(payload?.error?.message || "Meta access-token exchange failed");
  return payload.access_token;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const origin = request.cookies.get("meta_oauth_origin")?.value || requestUrl.origin;
  const organizationId = request.cookies.get("meta_oauth_organization_id")?.value;
  const returnPath = request.cookies.get("meta_oauth_return_path")?.value || null;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const savedState = request.cookies.get("meta_oauth_state")?.value;

  try {
    if (!organizationId) throw new Error("Organization context expired. Start the Meta connection again.");
    if (!code || !state || state !== savedState) throw new Error("Meta connection validation failed or expired");
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) throw new Error("Meta application credentials are not configured");

    const userAccessToken = await exchangeAuthorizationCode({code,origin});
    const pages = await fetchMetaMessagingPages({accessToken:userAccessToken});
    if (!pages.length) throw new Error("No Facebook Page with messaging access was available for this account");

    const preferredPageId = await existingMetaPreferredPageId({organizationId,pages});
    if (pages.length > 1 && !preferredPageId) {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const pending = await CredentialRuntime.storeSecret({
        provider_id:"meta",
        credential_type:"oauth_user_token_pending_selection",
        secret:userAccessToken,
        organization_id:organizationId,
        vault_name:`meta-selection-${organizationId}-${Date.now()}`,
        vault_description:"Temporary Meta user authorization for organization asset selection",
        metadata:{
          organization_id:organizationId,
          purpose:"META_PENDING_PAGE_SELECTION",
          expires_at:expiresAt,
          origin,
          return_path:returnPath,
          page_count:pages.length,
        },
      });
      const destination = new URL(`/workspace/${encodeURIComponent(organizationId)}/administration/meta-setup?onboarding=1`,origin);
      destination.searchParams.set("selection","required");
      const response = clearOauthCookies(NextResponse.redirect(destination));
      response.cookies.set("meta_pending_credential_id",pending.id,{
        httpOnly:true,
        secure:requestUrl.protocol === "https:",
        sameSite:"lax",
        path:"/",
        maxAge:600,
      });
      return response;
    }

    const pageId = preferredPageId || pages[0].id;
    await finalizeMetaOrganizationConnection({organizationId,userAccessToken,pageId,origin});
    return clearOauthCookies(NextResponse.redirect(resultUrl(origin,organizationId,"connected",null,returnPath)));
  } catch (error) {
    console.error("META_OAUTH_CALLBACK_ERROR",{organizationId:organizationId || null,message:error?.message || "Meta connection failed"});
    return clearOauthCookies(NextResponse.redirect(resultUrl(origin,organizationId || "unknown","error",error?.message || "Meta connection failed",returnPath)));
  }
}
