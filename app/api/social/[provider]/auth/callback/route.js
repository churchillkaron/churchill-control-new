export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { deactivateOtherActiveScopedCredentials } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  exchangeSocialAuthorizationCode,
  fetchSocialIdentity,
  getSocialOAuthConfig,
} from "@/lib/platform/channels/oauth/SocialOAuthRuntime";

const ASSET_TYPES = {
  threads: "threads_profile",
  tiktok: "tiktok_account",
  linkedin: "linkedin_identity",
  x: "x_account",
};

function text(value) { return String(value ?? "").trim(); }
function providerName(value) { return text(value).toLowerCase(); }
function safeReturnPath(authorization, organizationId) {
  const candidate = text(authorization?.metadata?.return_path);
  const allowed = `/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`;
  return candidate === allowed
    ? allowed
    : `/workspace/${encodeURIComponent(organizationId)}/administration/integrations`;
}
function destination(origin, authorization, organizationId, provider, message, status = "connected") {
  const url = new URL(safeReturnPath(authorization, organizationId), origin);
  url.searchParams.set("message", message);
  url.searchParams.set(provider, status);
  return url;
}

async function ensureService(organizationId, provider) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: provider,
  }).catch(() => null);
  if (existing && String(existing.status || "").toUpperCase() === "ACTIVE") return existing;
  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: "marketing-social",
    service_id: provider,
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
      connection_model: "ORGANIZATION_SOCIAL_OAUTH",
      provider,
    },
    configuration: existing?.configuration || {},
  });
}

export async function GET(request, { params }) {
  const requestUrl = new URL(request.url);
  const resolvedParams = await params;
  const provider = providerName(resolvedParams?.provider);
  const config = getSocialOAuthConfig(provider);
  let authorization = null;

  try {
    if (!config) throw new Error("Unsupported social connection");
    const state = requestUrl.searchParams.get("state");
    if (!state) throw new Error(`${provider} connection validation failed or expired`);
    authorization = await consumeOAuthAuthorization({ state, provider });

    const providerError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");
    if (providerError) throw new Error(`${provider} connection was not approved: ${providerError}`);
    const code = requestUrl.searchParams.get("code");
    if (!code) throw new Error(`${provider} did not return an authorization code`);

    const tokens = await exchangeSocialAuthorizationCode({
      provider,
      code,
      codeVerifier: text(authorization?.metadata?.pkce_verifier) || null,
    });
    const identity = await fetchSocialIdentity({ provider, accessToken:tokens.access_token });
    const organizationId = authorization.organization_id;
    const expiresIn = Number(tokens.expires_in) || 0;
    const secret = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_type: tokens.token_type || "Bearer",
      scope: tokens.scope || null,
      expires_at: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    };

    const credential = await CredentialRuntime.storeSecret({
      provider_id: provider,
      credential_type: "oauth_token",
      secret: JSON.stringify(secret),
      organization_id: organizationId,
      vault_name: `${provider}-oauth-${organizationId}-${identity.id}`,
      vault_description: `Organization ${provider} OAuth credential`,
      metadata: {
        organization_id: organizationId,
        purpose: `ORGANIZATION_${provider.toUpperCase()}_CONNECTION`,
        enabled: true,
        external_account_id: identity.id,
        username: identity.username || null,
        account_name: identity.name || identity.username || null,
        token_obtained_at: new Date().toISOString(),
      },
    });
    await deactivateOtherActiveScopedCredentials({
      provider_id: provider,
      organization_id: organizationId,
      purpose: `ORGANIZATION_${provider.toUpperCase()}_CONNECTION`,
      except_id: credential.id,
    });

    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider,
      channel_type: "social",
      credentials_reference: credential.id,
      metadata: {
        account_id: identity.id,
        account_name: identity.name || identity.username || provider,
        username: identity.username || null,
        connected_at: new Date().toISOString(),
        connection_model: "ORGANIZATION_SOCIAL_OAUTH",
      },
    });

    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider,
      asset_type: ASSET_TYPES[provider] || `${provider}_account`,
      external_id: identity.id,
      name: identity.name || identity.username || `${provider} account`,
      selected_by_party_id: authorization.party_id || null,
      selected_at: new Date().toISOString(),
      metadata: {
        username: identity.username || null,
      },
    });
    await ensureService(organizationId, provider);

    return NextResponse.redirect(destination(
      authorization.return_origin || requestUrl.origin,
      authorization,
      organizationId,
      provider,
      `${identity.name || identity.username || provider} connected.`,
    ));
  } catch (error) {
    const organizationId = authorization?.organization_id || "unknown";
    const origin = authorization?.return_origin || requestUrl.origin;
    return NextResponse.redirect(destination(
      origin,
      authorization,
      organizationId,
      provider || "social",
      error?.message || "Social connection failed",
      "error",
    ));
  }
}
