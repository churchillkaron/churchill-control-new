export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function normalizeShop(value) {
  const shop = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop) ? shop : null;
}

function clientId() {
  return String(process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || "").trim();
}

function clientSecret() {
  return String(process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Organization access denied" }, { status: access.status || 403 });
    }

    const shop = normalizeShop(url.searchParams.get("shop"));
    if (!shop) {
      return NextResponse.redirect(
        new URL(`/workspace/${encodeURIComponent(access.organizationId)}/administration/integrations/shopify-connect`, url.origin),
      );
    }
    if (!clientId() || !clientSecret()) {
      return NextResponse.json({ success: false, error: "Shopify connection is not configured by Avantiqo yet" }, { status: 503 });
    }

    const { state } = await createOAuthAuthorization({
      provider: "shopify",
      purpose: "shopify_store",
      organizationId: access.organizationId,
      partyId: access.staff?.party_id || null,
      returnOrigin: url.origin,
      metadata: { shop },
    });

    const redirectUri = `${url.origin}/api/shopify/auth/callback`;
    const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
    authorize.searchParams.set("client_id", clientId());
    authorize.searchParams.set("scope", "read_products,read_orders,read_inventory,read_locations");
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);
    return NextResponse.redirect(authorize);
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Shopify authorization failed" }, { status: 500 });
  }
}
