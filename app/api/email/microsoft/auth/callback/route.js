export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";

function callbackOrigin() {
  return new URL(process.env.MICROSOFT_EMAIL_OAUTH_CALLBACK_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "https://avantiqo.ai").origin;
}

function tenant() {
  return String(process.env.MICROSOFT_TENANT_ID || "common").trim();
}

function destination(origin, organizationId, message) {
  const url = new URL(`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`, origin);
  url.searchParams.set("message", message);
  return url;
}

async function ensureEmailService(organizationId) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "email",
  }).catch(() => null);

  if (existing && String(existing.status || "").toUpperCase() === "ACTIVE") {
    return existing;
  }

  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "communication",
    service_id: "email",
    package_id: existing?.package_id || "core",
    status: "ACTIVE",
    managed_by: existing?.managed_by || "organization",
    authorization_required: true,
    usage_enabled: true,
    billing_enabled: true,
    billing_mode: existing?.billing_mode || "USAGE",
    pricing_mode: existing?.pricing_mode || "PROVIDER",
    fallback_enabled: false,
    activated_at: existing?.activated_at || new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      connection_model: "ORGANIZATION_MAILBOX",
    },
    configuration: existing?.configuration || {},
  });
}

export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  let authorization = null;
  try {
    if (!state) throw new Error("Microsoft mailbox connection validation failed or expired");
    authorization = await consumeOAuthAuthorization({ state, provider: "email_microsoft" });
    if (url.searchParams.get("error")) {
      throw new Error(url.searchParams.get("error_description") || "Microsoft mailbox connection was not approved");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Microsoft did not return an authorization code");

    const body = new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: `${callbackOrigin()}/api/email/microsoft/auth/callback`,
      scope: "offline_access User.Read Mail.ReadWrite Mail.Send",
    });
    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      },
    );
    const tokens = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokens.access_token) {
      throw new Error(tokens.error_description || "Microsoft access-token exchange failed");
    }

    const identityResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    const identity = await identityResponse.json().catch(() => ({}));
    if (!identityResponse.ok || !identity.id) throw new Error(identity?.error?.message || "Microsoft mailbox identity could not be verified");
    const email = String(identity.mail || identity.userPrincipalName || "").trim().toLowerCase();
    if (!email) throw new Error("Microsoft mailbox email address is unavailable");

    const organizationId = authorization.organization_id;
    const credential = await CredentialRuntime.store({
      provider_id: "email_microsoft",
      credential_type: "oauth_token",
      secret_reference: JSON.stringify(tokens),
      metadata: {
        organization_id: organizationId,
        purpose: "ORGANIZATION_MICROSOFT_MAILBOX",
        email,
        external_account_id: identity.id,
        enabled: true,
      },
    });
    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "email_microsoft",
      channel_type: "email",
      credentials_reference: credential.id,
      metadata: {
        account_id: identity.id,
        account_name: identity.displayName || email,
        email,
        connected_at: new Date().toISOString(),
        connection_model: "ORGANIZATION_MICROSOFT_OAUTH",
      },
    });
    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: "email_microsoft",
      asset_type: "business_mailbox",
      external_id: identity.id,
      name: identity.displayName || email,
      metadata: { email },
    });
    await ensureEmailService(organizationId);

    return NextResponse.redirect(destination(authorization.return_origin || callbackOrigin(), organizationId, "Microsoft mailbox connected."));
  } catch (error) {
    return NextResponse.redirect(
      destination(
        authorization?.return_origin || callbackOrigin(),
        authorization?.organization_id || "unknown",
        error?.message || "Microsoft mailbox connection failed",
      ),
    );
  }
}
