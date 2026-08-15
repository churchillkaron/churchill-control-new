export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  exchangeSocialAuthorizationCode,
  fetchSocialIdentity,
  getSocialOAuthConfig,
} from "@/lib/platform/channels/oauth/SocialOAuthRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function destination(origin, organizationId, message) {
  const url = new URL(
    `/workspace/${encodeURIComponent(organizationId)}/administration/integrations`,
    origin,
  );
  url.searchParams.set("message", message);
  return url;
}

async function ensureLinkedInService(organizationId) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "linkedin",
  }).catch(() => null);

  if (existing && String(existing.status || "").toUpperCase() === "ACTIVE") {
    return existing;
  }

  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "marketing-social",
    service_id: "linkedin",
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
      provider: "linkedin",
      connection_model: "ORGANIZATION_OAUTH",
    },
    configuration: existing?.configuration || {},
  });
}

export async function GET(request, { params }) {
  const requestUrl = new URL(request.url);
  const resolved = await params;
  const provider = String(resolved?.provider || "").trim().toLowerCase();
  const config = getSocialOAuthConfig(provider);
  let authorization = null;

  try {
    if (!config) throw new Error("Unsupported social connection");
    const state = requestUrl.searchParams.get("state");
    if (!state) throw new Error("Provider connection validation failed or expired");
    authorization = await consumeOAuthAuthorization({ state, provider });

    const providerError = requestUrl.searchParams.get("error") || requestUrl.searchParams.get("error_description");
    if (providerError) throw new Error(`Connection was not approved: ${providerError}`);
    const code = requestUrl.searchParams.get("code");
    if (!code) throw new Error("Provider did not return an authorization code");

    const tokens = await exchangeSocialAuthorizationCode({
      provider,
      code,
      codeVerifier: authorization.metadata?.code_verifier || null,
    });
    const identity = await fetchSocialIdentity({
      provider,
      accessToken: tokens.access_token,
    });

    const organizationId = authorization.organization_id;
    const credential = await CredentialRuntime.store({
      provider_id: provider,
      credential_type: "oauth_token",
      secret_reference: JSON.stringify(tokens),
      metadata: {
        organization_id: organizationId,
        purpose: "ORGANIZATION_SOCIAL_CONNECTION",
        external_account_id: identity.id,
        enabled: true,
      },
    });

    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider,
      channel_type: "social",
      credentials_reference: credential.id,
      metadata: {
        account_id: identity.id,
        account_name: identity.name || identity.username || identity.id,
        username: identity.username || null,
        connected_at: new Date().toISOString(),
        connection_model: config.pkce ? "ORGANIZATION_OAUTH_PKCE" : "ORGANIZATION_OAUTH",
      },
    });

    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider,
      asset_type: "social_account",
      external_id: identity.id,
      name: identity.name || identity.username || identity.id,
      metadata: {
        username: identity.username || null,
      },
    });

    const authorizedAt = new Date().toISOString();
    await supabaseAdmin
      .from("organization_channel_connections")
      .update({
        authorized_by_party_id: authorization.party_id || null,
        authorized_at: authorizedAt,
        updated_at: authorizedAt,
      })
      .eq("id", connection.id)
      .eq("organization_id", organizationId);

    if (provider === "linkedin") {
      await ensureLinkedInService(organizationId);
    }

    return NextResponse.redirect(
      destination(
        authorization.return_origin || requestUrl.origin,
        organizationId,
        `${provider === "x" ? "X" : provider.charAt(0).toUpperCase() + provider.slice(1)} connected.`,
      ),
    );
  } catch (error) {
    const organizationId = authorization?.organization_id || "unknown";
    const origin = authorization?.return_origin || requestUrl.origin;
    return NextResponse.redirect(
      destination(origin, organizationId, error?.message || "Connection failed"),
    );
  }
}
