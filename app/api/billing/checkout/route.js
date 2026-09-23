import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import {
  getOrganizationModuleBillingCatalog,
} from "@/lib/billing/moduleBillingCatalog";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  getStripeBillingAccount,
  upsertStripeBillingAccount,
} from "@/lib/billing/stripeBillingAccounts";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function billingCycle(value) {
  const normalized = text(value || "monthly").toLowerCase();
  if (!["monthly", "yearly"].includes(normalized)) {
    throw new Error("BILLING_CYCLE_INVALID");
  }
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organizationId || body.organization_id);
    const cycle = billingCycle(body.billingCycle || body.billing_cycle);

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

    const organizationResult = await supabaseAdmin
      .from("organizations")
      .select("id,name,legal_name")
      .eq("id", access.organizationId)
      .maybeSingle();
    if (organizationResult.error) throw organizationResult.error;
    if (!organizationResult.data) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    const catalog = await getOrganizationModuleBillingCatalog({
      organizationId: access.organizationId,
      billingCycle: cycle,
      provider: "stripe",
    });

    if (catalog.missingMappings.length) {
      return NextResponse.json(
        {
          success: false,
          error: "Stripe catalog is not synchronized for all billable modules",
          code: "STRIPE_CATALOG_INCOMPLETE",
          missingModules: catalog.missingMappings,
        },
        { status: 503 },
      );
    }

    if (!catalog.items.length) {
      return NextResponse.json(
        {
          success: false,
          error: "No billable active modules are configured",
          code: "NO_BILLABLE_MODULES",
          unpricedModules: catalog.unpricedModules,
        },
        { status: 400 },
      );
    }

    const existing = await getStripeBillingAccount(access.organizationId);
    if (
      existing?.stripe_subscription_id &&
      ACTIVE_SUBSCRIPTION_STATUSES.has(
        text(existing.status).toLowerCase(),
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "An active Stripe subscription already exists; use Manage billing",
          code: "BILLING_SUBSCRIPTION_ALREADY_EXISTS",
        },
        { status: 409 },
      );
    }

    const moduleIds = catalog.items.map((item) => item.module_id);
    const priceKey = `modules:${cycle}`;
    const customer = await StripeProvider.ensureCustomer({
      organizationId: access.organizationId,
      customerId: existing?.stripe_customer_id || null,
      email: access.user?.email || null,
      name: organizationResult.data.legal_name || organizationResult.data.name,
      metadata: {
        priceKey,
        billingCycle: cycle,
        moduleCount: String(moduleIds.length),
      },
    });

    await upsertStripeBillingAccount({
      organization_id: access.organizationId,
      stripe_customer_id: customer.id,
      stripe_subscription_id: existing?.stripe_subscription_id || null,
      stripe_price_id:
        catalog.items.length === 1
          ? catalog.items[0].provider_price_id
          : null,
      plan_key: priceKey,
      status: existing?.status || "INACTIVE",
      metadata: {
        ...(existing?.metadata || {}),
        checkout_price_key: priceKey,
        billing_cycle: cycle,
        module_ids: moduleIds,
        unpriced_modules: catalog.unpricedModules,
        catalog_environment: catalog.environment,
        canonical_currency: catalog.currency,
        canonical_total: catalog.total,
      },
    });

    const origin = appOrigin(request);
    const billingPath =
      `/workspace/${encodeURIComponent(access.organizationId)}/services/billing`;
    const requestKey =
      text(request.headers.get("idempotency-key")) || randomUUID();

    const session = await StripeProvider.createSubscriptionCheckout({
      organizationId: access.organizationId,
      customerId: customer.id,
      lineItems: catalog.items.map((item) => ({
        price: item.provider_price_id,
        quantity: 1,
      })),
      priceKey,
      billingCycle: cycle,
      moduleIds,
      successUrl:
        `${origin}${billingPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}${billingPath}?checkout=cancelled`,
      idempotencyKey:
        `avantiqo:checkout:${access.organizationId}:${priceKey}:${requestKey}`,
    });

    return NextResponse.json({
      success: true,
      url: session.url,
      sessionId: session.id,
      priceKey,
      billingCycle: cycle,
      currency: catalog.currency,
      total: catalog.total,
      modules: moduleIds,
      unpricedModules: catalog.unpricedModules,
    });
  } catch (error) {
    console.error("BILLING_CHECKOUT_ERROR", error);
    const message = error?.message || "Checkout could not be created";
    const clientError = message.startsWith("BILLING_");
    return NextResponse.json(
      { success: false, error: message },
      { status: clientError ? 400 : 500 },
    );
  }
}
