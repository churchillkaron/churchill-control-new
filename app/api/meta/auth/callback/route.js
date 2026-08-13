export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
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
  const configured = String(
    process.env.META_GRAPH_API_VERSION || process.env.META_GRAPH_VERSION || "v24.0"
  ).trim();
  return configured.startsWith("v") ? configured : `v${configured}`;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function messagingWebhookVerifyToken() {
  const configured = String(
    process.env.META_MESSAGING_WEBHOOK_VERIFY_TOKEN || ""
  ).trim();
  if (configured) return configured;

  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  if (!appSecret) {
    throw new Error("Meta application secret is not configured");
  }

  return crypto
    .createHash("sha256")
    .update(`avantiqo:meta-messaging-webhook:${appSecret}`)
    .digest("hex");
}

function clearOauthCookies(response) {
  response.cookies.delete("meta_oauth_state");
  response.cookies.delete("meta_oauth_organization_id");
  response.cookies.delete("meta_oauth_origin");
  return response;
}

function redirectToWorkspace(origin, organizationId, status, message = null) {
  const url = new URL(
    `/workspace/${organizationId}/administration/integrations#meta`,
    origin
  );
  url.searchParams.set("meta", status);
  if (message) url.searchParams.set("message", message.slice(0, 180));
  return url;
}

async function graphJson(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
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

function appAccessToken() {
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    throw new Error("Meta application credentials are not configured");
  }
  return `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
}

async function configureAppWebhookSubscription({ objectType, fields, origin }) {
  const verifyToken = messagingWebhookVerifyToken();

  const callbackUrl = `${origin}/api/commercial/communications/webhooks/meta`;
  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${process.env.META_APP_ID}/subscriptions`
  );
  url.searchParams.set("object", objectType);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("verify_token", verifyToken);
  url.searchParams.set("fields", fields.join(","));
  url.searchParams.set("access_token", appAccessToken());

  const result = await graphJson(url, { method: "POST" });
  if (result?.success !== true && result?.success !== "true") {
    throw new Error(`Meta ${objectType} webhook configuration failed`);
  }

  return {
    object_type: objectType,
    callback_url: callbackUrl,
    fields,
  };
}

async function configureMessagingWebhooks(origin) {
  const page = await configureAppWebhookSubscription({
    objectType: "page",
    origin,
    fields: [
      "messages",
      "messaging_postbacks",
      "message_deliveries",
      "message_reads",
    ],
  });

  const instagram = await configureAppWebhookSubscription({
    objectType: "instagram",
    origin,
    fields: ["messages", "messaging_postbacks"],
  });

  return { page, instagram };
}

async function subscribePageMessaging(page) {
  if (!page?.id || !page?.access_token) {
    throw new Error("Meta Page messaging subscription requires a Page access token");
  }

  const url = new URL(
    `https://graph.facebook.com/${graphVersion()}/${page.id}/subscribed_apps`
  );
  url.searchParams.set(
    "subscribed_fields",
    "messages,messaging_postbacks,message_deliveries,message_reads"
  );
  url.searchParams.set("access_token", page.access_token);

  const result = await graphJson(url, { method: "POST" });
  if (result?.success !== true && result?.success !== "true") {
    throw new Error(`Meta messaging webhook subscription failed for ${page.name || page.id}`);
  }

  return true;
}

function assignedFacebookAsset(assets) {
  const facebookAssets = assets.filter((asset) => asset.asset_type === "facebook_page");
  const instagramPageIds = new Set(
    assets
      .filter((asset) => asset.asset_type === "instagram_business")
      .map((asset) => clean(asset?.metadata?.facebook_page_id))
      .filter(Boolean),
  );

  return (
    facebookAssets.find((asset) =>
      clean(asset?.metadata?.identity_connection_model) === "MANAGED_ASSET_ASSIGNMENT" ||
      clean(asset?.metadata?.managed_ad_account_id),
    ) ||
    facebookAssets.find((asset) => instagramPageIds.has(clean(asset.external_id))) ||
    (facebookAssets.length === 1 ? facebookAssets[0] : null)
  );
}

function resolvePrimaryMessagingPage({ messagingPages, existingAssets, existingConnection }) {
  const assignedAsset = assignedFacebookAsset(existingAssets);
  const existingFacebookAssets = existingAssets.filter(
    (asset) => asset.asset_type === "facebook_page",
  );

  const preferredPageId =
    clean(assignedAsset?.external_id) ||
    (existingFacebookAssets.length === 0
      ? clean(existingConnection?.metadata?.page_id)
      : null);

  if (preferredPageId) {
    const matchedPage = messagingPages.find(
      (page) => clean(page?.id) === preferredPageId,
    );
    if (!matchedPage) {
      throw new Error(
        "The Facebook Page assigned to this organization was not included in the Meta authorization. Reconnect and keep that Page selected.",
      );
    }
    return { page: matchedPage, existingFacebookAsset: assignedAsset };
  }

  if (existingFacebookAssets.length > 1) {
    throw new Error(
      "Multiple Facebook Pages are already linked to this organization and no primary Page is assigned.",
    );
  }

  if (messagingPages.length === 1) {
    return { page: messagingPages[0], existingFacebookAsset: null };
  }

  throw new Error(
    "Multiple Facebook Pages are available. Assign the organization's primary Facebook Page before reconnecting Meta.",
  );
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

    const existingConnection = await ChannelConnectionRuntime.get({
      organization_id: organizationId,
      provider: "meta",
    });
    const existingAssets = existingConnection?.id
      ? await ChannelAssetRuntime.list({
          organization_id: organizationId,
          connection_id: existingConnection.id,
        })
      : [];

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

    const webhookConfiguration = await configureMessagingWebhooks(origin);

    const pagesUrl = new URL(
      `https://graph.facebook.com/${graphVersion()}/me/accounts`
    );
    pagesUrl.searchParams.set(
      "fields",
      "id,name,access_token,tasks,instagram_business_account{id,username}"
    );
    pagesUrl.searchParams.set("limit", "100");
    pagesUrl.searchParams.set("access_token", tokenData.access_token);

    const pagesData = await graphJson(pagesUrl);
    const pages = Array.isArray(pagesData?.data) ? pagesData.data : [];
    if (!pages.length) {
      throw new Error("No Facebook Pages were available for this account");
    }

    const messagingPages = pages.filter((page) =>
      Array.isArray(page?.tasks) ? page.tasks.includes("MESSAGING") : true
    );
    if (!messagingPages.length) {
      throw new Error("No Facebook Page with the MESSAGING task was available");
    }

    const { page: primaryPage, existingFacebookAsset } =
      resolvePrimaryMessagingPage({
        messagingPages,
        existingAssets,
        existingConnection,
      });

    await subscribePageMessaging(primaryPage);

    const primaryInstagramId = primaryPage.instagram_business_account?.id || null;
    const existingInstagramAsset = existingAssets.find(
      (asset) =>
        asset.asset_type === "instagram_business" &&
        (
          clean(asset.external_id) === clean(primaryInstagramId) ||
          clean(asset?.metadata?.facebook_page_id) === clean(primaryPage.id)
        ),
    ) || null;

    const credential = await CredentialRuntime.store({
      provider_id: "meta",
      credential_type: "oauth_page_token",
      secret_reference: primaryPage.access_token,
      metadata: {
        organization_id: organizationId,
        page_id: primaryPage.id,
        page_name: primaryPage.name,
        instagram_business_id: primaryInstagramId,
        instagram_username:
          primaryPage.instagram_business_account?.username || null,
        purpose: "ORGANIZATION_CHANNEL_PUBLISHING",
        messaging_permissions_requested: [
          "pages_manage_metadata",
          "pages_messaging",
          "instagram_manage_messages",
        ],
        messaging_webhook_subscribed: true,
        messaging_app_webhooks_configured: true,
        messaging_app_webhook_configuration: webhookConfiguration,
        instagram_auth_mode: "FACEBOOK_LOGIN",
      },
    });

    const existingConnectionMetadata = object(existingConnection?.metadata);
    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "meta",
      channel_type: "social",
      credentials_reference: credential.id,
      metadata: {
        ...existingConnectionMetadata,
        page_id: primaryPage.id,
        page_name: primaryPage.name,
        instagram_business_id: primaryInstagramId,
        instagram_username:
          primaryPage.instagram_business_account?.username || null,
        messaging_webhook_subscribed: true,
        messaging_app_webhooks_configured: true,
        messaging_app_webhook_configuration: webhookConfiguration,
        messaging_webhook_fields: [
          "messages",
          "messaging_postbacks",
          "message_deliveries",
          "message_reads",
        ],
        available_pages: messagingPages.map((page) => ({
          id: page.id,
          name: page.name,
          instagram_business_id:
            page.instagram_business_account?.id || null,
          instagram_username:
            page.instagram_business_account?.username || null,
          messaging_task: Array.isArray(page?.tasks)
            ? page.tasks.includes("MESSAGING")
            : null,
        })),
        advertising_billing_model:
          existingConnectionMetadata.advertising_billing_model || "AVANTIQO_MANAGED",
      },
    });

    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: "meta",
      asset_type: "facebook_page",
      external_id: primaryPage.id,
      name: primaryPage.name,
      entity_id: existingFacebookAsset?.entity_id || null,
      selected_by_party_id: existingFacebookAsset?.selected_by_party_id || null,
      selected_at: existingFacebookAsset?.selected_at || null,
      metadata: {
        ...object(existingFacebookAsset?.metadata),
        instagram_business_id: primaryInstagramId,
        instagram_username:
          primaryPage.instagram_business_account?.username || null,
        messaging_webhook_subscribed: true,
        messaging_app_webhooks_configured: true,
      },
    });

    if (primaryInstagramId) {
      await ChannelAssetRuntime.register({
        organization_id: organizationId,
        connection_id: connection.id,
        provider: "meta",
        asset_type: "instagram_business",
        external_id: primaryInstagramId,
        name:
          primaryPage.instagram_business_account?.username ||
          `${primaryPage.name} Instagram`,
        entity_id: existingInstagramAsset?.entity_id || null,
        selected_by_party_id: existingInstagramAsset?.selected_by_party_id || null,
        selected_at: existingInstagramAsset?.selected_at || null,
        metadata: {
          ...object(existingInstagramAsset?.metadata),
          facebook_page_id: primaryPage.id,
          messaging_webhook_subscribed: true,
          messaging_app_webhooks_configured: true,
        },
      });
    }

    const response = NextResponse.redirect(
      redirectToWorkspace(origin, organizationId, "connected")
    );
    return clearOauthCookies(response);
  } catch (error) {
    console.error("META_OAUTH_CALLBACK_ERROR", {
      organizationId: organizationId || null,
      message: error?.message || "Meta connection failed",
    });
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
