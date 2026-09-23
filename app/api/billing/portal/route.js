import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getStripeBillingAccount } from "@/lib/billing/stripeBillingAccounts";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";

function text(value) {
  return String(value ?? "").trim();
}

function billingOwner(access) {
  return new Set([
    "OWNER",
    "ORGANIZATION_OWNER",
    "ORG_OWNER",
    "PLATFORM_OWNER",
    "SUPER_ADMIN",
  ]).has(String(access?.role || "").trim().toUpperCase());
}

function appOrigin(request) {
  const url = new URL(request.url);
  const hostname = String(url.hostname || "").toLowerCase();
  const origin = String(url.origin || "").replace(/\/$/, "");

  if (
    hostname === "avantiqo.ai" ||
    hostname === "www.avantiqo.ai" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".vercel.app")
  ) {
    return origin;
  }

  return "https://avantiqo.ai";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }
    if (!billingOwner(access)) {
      return NextResponse.json(
        { success: false, error: "Organization owner access required" },
        { status: 403 },
      );
    }

    const billing = await getStripeBillingAccount(access.organizationId);
    if (!billing?.stripe_customer_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Stripe billing customer is not configured for this organization",
          code: "STRIPE_CUSTOMER_NOT_CONFIGURED",
        },
        { status: 409 },
      );
    }

    const origin = appOrigin(request);
    const returnUrl =
      `${origin}/workspace/${encodeURIComponent(access.organizationId)}/services/billing`;
    const session = await StripeProvider.createBillingPortalSession({
      organizationId: access.organizationId,
      customerId: billing.stripe_customer_id,
      returnUrl,
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error("BILLING_PORTAL_ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Billing portal could not be created",
      },
      { status: 500 },
    );
  }
}
