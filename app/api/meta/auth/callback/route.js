export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  CredentialRuntime,
} from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";

import {
  ChannelConnectionRuntime,
} from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";

import {
  ChannelAssetRuntime,
} from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

function graphVersion() {
  const configured = String(process.env.META_GRAPH_API_VERSION || "").trim();
  if (!configured) throw new Error("META_GRAPH_API_VERSION is not configured");
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function clearOauthCookies(response) {
  response.cookies.delete("meta_oauth_state");
  response.cookies.delete("meta_oauth_organization_id");
  response.cookies.delete("meta_oauth_origin");
  return response;
}

function redirectToWorkspace(origin, organizationId, status, message = null) {
  const url = new URL(
    `/workspace/${organizationId}/commercial/marketing/ads`,
    origin
  );
  url.searchParams.set("meta", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return url;
}

async function graphJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error?.error_user_msg ||
      payload?.error?.message ||
      `Meta request failed (${response.status})`
    );
  }
  return payload;
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const origin = request.cookies.get("meta_oauth_origin")?.value || requestUrl.origin;
  const organizationId = request.cookies.get("meta_oauth_organization_id")?.value;
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const savedState = request.cookies.get("meta_oauth_state")?.value;

  try {
    if (!organizationId) {
      throw new Error("Organization context expired. Start the connection again.");
    }
    if (!code || !state || state !== savedState) {
      throw new Error("Meta connection validation failed or expired");
    }
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      throw new Error("Meta application credentials are not configured");
    }

    const callbackUrl = `${origin}/api/meta/auth/callback`;
    const tokenUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/oauth/access_token`
    );
    tokenUrl.searchParams.set("client_id", process.env.META_APP_ID);
    tokenUrl.searchParams.set("client_secret", process.env.META_APP_SECRET);
    tokenUrl.searchParams.set("redirect_uri", callbackUrl);
    tokenUrl.searchParams.set("code", code);

    const tokenData = await graphJson(tokenUrl);
    if (!tokenData.access_token) {
      throw new Error("Meta did not return an access token");
    }

    const pagesUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/me/accounts`
    );
    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,instagram_business_account{id,username}"
    );
    pagesUrl.searchParams.set("limit", "100");
    pagesUrl.searchParams.set("access_token", tokenData.access_token);

    const pagesData = await graphJson(pagesUrl);
    const pages = Array.isArray(pagesData?.data) ? pagesData.data : [];
    if (!pages.length) {
      throw new Error("No Facebook Pages were available for this account");
    }

    const primaryPage = pages[0];
    const credential = await CredentialRuntime.store({
      provider_id: "meta",
      credential_type: "oauth_page_token",
      secret_reference: primaryPage.access_token,
      metadata: {
        organization_id: organizationId,
        page_id: primaryPage.id,
        page_name: primaryPage.name,
        purpose: "ORGANIZATION_CHANNEL_PUBLISHING",
      },
    });

    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "meta",
      channel_type: "social",
      credentials_reference: credential.id,
      metadata: {
        page_id: primaryPage.id,
        page_name: primaryPage.name,
        instagram_business_id:
          primaryPage.instagram_business_account?.id || null,
        available_pages: pages.map((page) => ({
          id: page.id,
          name: page.name,
          instagram_business_id:
            page.instagram_business_account?.id || null,
          instagram_username:
            page.instagram_business_account?.username || null,
        })),
        advertising_billing_model: "AVANTIQO_MANAGED",
      },
    });

    for (const page of pages) {
      await ChannelAssetRuntime.register({
        organization_id: organizationId,
        connection_id: connection.id,
        provider: "meta",
        asset_type: "facebook_page",
        external_id: page.id,
        name: page.name,
        metadata: {
          instagram_business_id:
            page.instagram_business_account?.id || null,
          instagram_username:
            page.instagram_business_account?.username || null,
        },
      });

      if (page.instagram_business_account?.id) {
        await ChannelAssetRuntime.register({
          organization_id: organizationId,
          connection_id: connection.id,
          provider: "meta",
          asset_type: "instagram_business",
          external_id: page.instagram_business_account.id,
          name:
            page.instagram_business_account.username ||
            `${page.name} Instagram`,
          metadata: { facebook_page_id: page.id },
        });
      }
    }

    const response = NextResponse.redirect(
      redirectToWorkspace(origin, organizationId, "connected")
    );
    return clearOauthCookies(response);
  } catch (error) {
    const response = NextResponse.redirect(
      redirectToWorkspace(
        origin,
        organizationId || "unknown",
        "error",
        error?.message || "Meta connection failed"
      )
    );
    return clearOauthCookies(response);
  }
}
