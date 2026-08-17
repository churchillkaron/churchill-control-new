export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const API_VERSION = "2026-07";
const WEBHOOK_TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_PAID",
  "ORDER_TRANSACTIONS_CREATE",
  "ORDERS_FULFILLED",
  "ORDERS_PARTIALLY_FULFILLED",
  "REFUNDS_CREATE",
  "FULFILLMENTS_CREATE",
  "FULFILLMENTS_UPDATE",
  "INVENTORY_ITEMS_UPDATE",
  "INVENTORY_LEVELS_UPDATE",
  "LOCATIONS_CREATE",
  "LOCATIONS_UPDATE",
  "LOCATIONS_DELETE",
];

function text(value) {
  return String(value ?? "").trim();
}

function clientId() {
  return text(process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY);
}

function clientSecret() {
  return text(process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET);
}

function publicOrigin(requestUrl) {
  return new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      requestUrl.origin,
  ).origin;
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyHmac(url) {
  const params = [...url.searchParams.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));
  const message = params.map(([key, value]) => `${key}=${value}`).join("&");
  const digest = crypto.createHmac("sha256", clientSecret()).update(message).digest("hex");
  return safeEqual(digest, url.searchParams.get("hmac"));
}

function destination(origin, organizationId, message) {
  const url = new URL(
    `/workspace/${encodeURIComponent(organizationId)}/administration/integrations`,
    origin,
  );
  url.searchParams.set("message", message);
  return url;
}

async function graph({ shop, accessToken, query, variables = {} }) {
  const response = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.errors?.length) {
    throw new Error(
      payload?.errors?.[0]?.message ||
        `Shopify GraphQL request failed (${response.status})`,
    );
  }
  return payload?.data || {};
}

async function registerWebhooks({ shop, accessToken, webhookUrl }) {
  const existingData = await graph({
    shop,
    accessToken,
    query: `
      query AvantiqoWebhookSubscriptions {
        webhookSubscriptions(first: 100) {
          nodes { id topic uri }
        }
      }
    `,
  });
  const existing = new Set(
    (existingData?.webhookSubscriptions?.nodes || []).map(
      (row) => `${row.topic}|${row.uri}`,
    ),
  );

  const mutation = `
    mutation AvantiqoWebhookSubscriptionCreate(
      $topic: WebhookSubscriptionTopic!,
      $webhookSubscription: WebhookSubscriptionInput!
    ) {
      webhookSubscriptionCreate(
        topic: $topic,
        webhookSubscription: $webhookSubscription
      ) {
        webhookSubscription { id topic uri }
        userErrors { field message }
      }
    }
  `;

  const registered = [];
  for (const topic of WEBHOOK_TOPICS) {
    if (existing.has(`${topic}|${webhookUrl}`)) {
      registered.push(topic);
      continue;
    }
    const data = await graph({
      shop,
      accessToken,
      query: mutation,
      variables: {
        topic,
        webhookSubscription: {
          uri: webhookUrl,
          format: "JSON",
        },
      },
    });
    const result = data?.webhookSubscriptionCreate || {};
    if (result?.userErrors?.length) {
      throw new Error(
        result.userErrors.map((row) => row.message).filter(Boolean).join("; ") ||
          `Shopify webhook setup failed for ${topic}`,
      );
    }
    if (!result?.webhookSubscription?.id) {
      throw new Error(`Shopify webhook setup failed for ${topic}`);
    }
    registered.push(topic);
  }
  return registered;
}

async function ensureOnlineStoreService(organizationId) {
  const existing = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: "online-store",
  }).catch(() => null);

  if (existing && String(existing.status || "").toUpperCase() === "ACTIVE") {
    return existing;
  }

  return OrganizationServiceRuntime.save({
    ...(existing || {}),
    organization_id: organizationId,
    service_category_id: existing?.service_category_id || "commerce",
    service_id: "online-store",
    package_id: existing?.package_id || "growth",
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
      provider: "shopify",
      connection_model: "ORGANIZATION_OAUTH",
    },
    configuration: existing?.configuration || {},
  });
}

async function automaticEntityId(organizationId) {
  const result = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .limit(2);
  if (result.error) throw result.error;
  return result.data?.length === 1 ? result.data[0].id : null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  let authorization = null;

  try {
    if (!clientId() || !clientSecret()) {
      throw new Error("Shopify connection is not configured by Avantiqo yet");
    }
    if (!state || !verifyHmac(url)) {
      throw new Error("Shopify connection validation failed");
    }

    authorization = await consumeOAuthAuthorization({ state, provider: "shopify" });
    const organizationId = authorization.organization_id;
    const shop = text(
      url.searchParams.get("shop") || authorization.metadata?.shop,
    ).toLowerCase();
    const code = url.searchParams.get("code");
    if (!shop || !code) {
      throw new Error("Shopify did not return the required authorization data");
    }

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
      }),
      cache: "no-store",
    });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) {
      throw new Error(
        token.error_description || "Shopify access token exchange failed",
      );
    }

    const granted = new Set(
      String(token.scope || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const required = [
      "read_products",
      "read_orders",
      "read_inventory",
      "read_locations",
      "read_fulfillments",
    ];
    const missing = required.filter((scope) => !granted.has(scope));
    if (missing.length) {
      throw new Error(
        `Shopify did not grant required access: ${missing.join(", ")}`,
      );
    }

    const identityData = await graph({
      shop,
      accessToken: token.access_token,
      query: `
        query AvantiqoShopIdentity {
          shop {
            id
            name
            email
            myshopifyDomain
            primaryDomain { url }
          }
        }
      `,
    });
    const identity = identityData?.shop;
    if (!identity?.id) throw new Error("Shopify store verification failed");

    const priorConnection = await ChannelConnectionRuntime.get({
      organization_id: organizationId,
      provider: "shopify",
    }).catch(() => null);

    const credential = await CredentialRuntime.store({
      provider_id: "shopify",
      credential_type: "oauth_access_token",
      secret_reference: token.access_token,
      metadata: {
        organization_id: organizationId,
        purpose: "ORGANIZATION_SHOPIFY_STORE",
        shop,
        scope: token.scope || null,
        enabled: true,
      },
    });

    const connectedAt = new Date().toISOString();
    let connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "shopify",
      channel_type: "commerce",
      credentials_reference: credential.id,
      metadata: {
        ...(priorConnection?.metadata || {}),
        shop,
        shop_id: identity.id,
        account_name: identity.name || shop,
        primary_domain: identity.primaryDomain?.url || null,
        connected_at: connectedAt,
        connection_model: "ORGANIZATION_SHOPIFY_OAUTH",
        webhook_ready: false,
      },
    });

    const existingStore = await ChannelAssetRuntime.find({
      organization_id: organizationId,
      provider: "shopify",
      asset_type: "shopify_store",
      external_id: identity.id,
    }).catch(() => null);
    const inferredEntityId = await automaticEntityId(organizationId);
    const entityId = existingStore?.entity_id || inferredEntityId || null;

    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: "shopify",
      asset_type: "shopify_store",
      external_id: identity.id,
      name: identity.name || shop,
      entity_id: entityId,
      selected_by_party_id: existingStore?.selected_by_party_id || null,
      selected_at:
        existingStore?.selected_at ||
        (entityId ? new Date().toISOString() : null),
      metadata: {
        ...(existingStore?.metadata || {}),
        shop,
        primary_domain: identity.primaryDomain?.url || null,
        entity_id: entityId,
        entity_mapping_mode: existingStore?.entity_id
          ? "PRESERVED"
          : inferredEntityId
            ? "AUTO_SINGLE_ENTITY"
            : "MANUAL_REQUIRED",
        projection_ready: Boolean(entityId),
      },
    });

    const webhookUrl = `${publicOrigin(url)}/api/commerce/shopify/webhooks`;
    const webhookTopics = await registerWebhooks({
      shop,
      accessToken: token.access_token,
      webhookUrl,
    });

    connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "shopify",
      channel_type: "commerce",
      credentials_reference: credential.id,
      metadata: {
        ...(priorConnection?.metadata || {}),
        shop,
        shop_id: identity.id,
        account_name: identity.name || shop,
        primary_domain: identity.primaryDomain?.url || null,
        connected_at: connectedAt,
        connection_model: "ORGANIZATION_SHOPIFY_OAUTH",
        webhook_ready: true,
        webhook_url: webhookUrl,
        webhook_topics: webhookTopics,
        webhook_configured_at: new Date().toISOString(),
        shopify_reconciliation: {
          status: "QUEUED",
          requested_at: new Date().toISOString(),
          products: {},
          orders: {},
          inventory: {},
          locations: {},
        },
      },
    });

    const authorizedAt = new Date().toISOString();
    const authorizationUpdate = await supabaseAdmin
      .from("organization_channel_connections")
      .update({
        authorized_by_party_id: authorization.party_id || null,
        authorized_at: authorizedAt,
        updated_at: authorizedAt,
      })
      .eq("id", connection.id)
      .eq("organization_id", organizationId);
    if (authorizationUpdate.error) throw authorizationUpdate.error;

    await ensureOnlineStoreService(organizationId);

    return NextResponse.redirect(
      destination(
        authorization.return_origin || url.origin,
        organizationId,
        entityId
          ? "Shopify connected. Avantiqo is importing the store and activating commerce synchronization automatically."
          : "Shopify connected. Choose the legal entity for this store to activate order synchronization.",
      ),
    );
  } catch (error) {
    return NextResponse.redirect(
      destination(
        authorization?.return_origin || url.origin,
        authorization?.organization_id || "unknown",
        error?.message || "Shopify connection failed",
      ),
    );
  }
}
