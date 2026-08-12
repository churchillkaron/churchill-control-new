export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";

function clientId() {
  return String(process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || "").trim();
}

function clientSecret() {
  return String(process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || "").trim();
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
  const url = new URL(`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`, origin);
  url.searchParams.set("message", message);
  return url;
}

export async function GET(request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  let authorization = null;
  try {
    if (!clientId() || !clientSecret()) throw new Error("Shopify connection is not configured by Avantiqo yet");
    if (!state || !verifyHmac(url)) throw new Error("Shopify connection validation failed");
    authorization = await consumeOAuthAuthorization({ state, provider: "shopify" });
    const organizationId = authorization.organization_id;
    const shop = String(url.searchParams.get("shop") || authorization.metadata?.shop || "").trim().toLowerCase();
    const code = url.searchParams.get("code");
    if (!shop || !code) throw new Error("Shopify did not return the required authorization data");

    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), code }),
      cache: "no-store",
    });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) throw new Error(token.error_description || "Shopify access token exchange failed");

    const granted = new Set(String(token.scope || "").split(",").map((value) => value.trim()).filter(Boolean));
    const required = ["read_products", "read_orders", "read_inventory", "read_locations"];
    const missing = required.filter((scope) => !granted.has(scope));
    if (missing.length) throw new Error(`Shopify did not grant required access: ${missing.join(", ")}`);

    const gqlResponse = await fetch(`https://${shop}/admin/api/2026-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token.access_token },
      body: JSON.stringify({ query: "query AvantiqoShopIdentity { shop { id name email myshopifyDomain primaryDomain { url } } }" }),
      cache: "no-store",
    });
    const gql = await gqlResponse.json().catch(() => ({}));
    const identity = gql?.data?.shop;
    if (!gqlResponse.ok || !identity?.id) throw new Error(gql?.errors?.[0]?.message || "Shopify store verification failed");

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
    const connection = await ChannelConnectionRuntime.connect({
      organization_id: organizationId,
      provider: "shopify",
      channel_type: "commerce",
      credentials_reference: credential.id,
      metadata: {
        shop,
        shop_id: identity.id,
        account_name: identity.name || shop,
        primary_domain: identity.primaryDomain?.url || null,
        connected_at: new Date().toISOString(),
      },
    });
    await ChannelAssetRuntime.register({
      organization_id: organizationId,
      connection_id: connection.id,
      provider: "shopify",
      asset_type: "shopify_store",
      external_id: identity.id,
      name: identity.name || shop,
      metadata: { shop, primary_domain: identity.primaryDomain?.url || null },
    });

    return NextResponse.redirect(destination(authorization.return_origin || url.origin, organizationId, "Shopify connected."));
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
