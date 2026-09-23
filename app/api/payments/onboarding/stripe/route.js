import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { StripeProvider } from "@/lib/platform/service-runtime/providers/stripe/StripeProvider";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function clean(value) {
  return String(value ?? "").trim();
}

function platformOrigin(request) {
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

function ownerRole(role) {
  return new Set([
    "OWNER",
    "ORGANIZATION_OWNER",
    "ORG_OWNER",
    "PLATFORM_OWNER",
    "SUPER_ADMIN",
  ]).has(clean(role).toUpperCase());
}

function status(account) {
  if (account?.charges_enabled && account?.payouts_enabled) return "ACTIVE";
  if (account?.details_submitted) return "REVIEW";
  return "PENDING";
}

async function loadConnection(organizationId) {
  const result = await supabaseAdmin
    .from("organization_payment_provider_accounts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "stripe")
    .eq("purpose", "merchant_payments")
    .maybeSingle();

  if (result.error) throw result.error;
  return result.data || null;
}

async function syncConnection(organizationId, connection) {
  if (!connection?.provider_account_id) {
    throw new Error("STRIPE_CONNECTED_ACCOUNT_NOT_CONFIGURED");
  }

  const account = await StripeProvider.retrieveConnectedAccount({
    organizationId,
    connectedAccountId: connection.provider_account_id,
  });

  const updated = await supabaseAdmin
    .from("organization_payment_provider_accounts")
    .update({
      status: status(account),
      charges_enabled: Boolean(account.charges_enabled),
      payouts_enabled: Boolean(account.payouts_enabled),
      details_submitted: Boolean(account.details_submitted),
      requirements: account.requirements || {},
      metadata: {
        ...(connection.metadata || {}),
        country: account.country || null,
        default_currency: account.default_currency || null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", connection.id)
    .select("*")
    .single();

  if (updated.error) throw updated.error;

  const existingConfig = await supabaseAdmin
    .from("organization_payment_config")
    .select("id,configuration")
    .eq("organization_id", organizationId)
    .eq("payment_method", "credit_card")
    .maybeSingle();

  if (existingConfig.error) throw existingConfig.error;

  const configPayload = {
    country: account.country || null,
    currency: account.default_currency
      ? String(account.default_currency).toUpperCase()
      : null,
    enabled: Boolean(account.charges_enabled),
    configuration: {
      ...(existingConfig.data?.configuration || {}),
      provider: "stripe",
      provider_connection_id: connection.id,
    },
    updated_at: new Date().toISOString(),
  };

  if (existingConfig.data?.id) {
    const configUpdate = await supabaseAdmin
      .from("organization_payment_config")
      .update(configPayload)
      .eq("id", existingConfig.data.id);
    if (configUpdate.error) throw configUpdate.error;
  } else {
    const configInsert = await supabaseAdmin
      .from("organization_payment_config")
      .insert({
        organization_id: organizationId,
        payment_method: "credit_card",
        ...configPayload,
      });
    if (configInsert.error) throw configInsert.error;
  }

  return { account, connection: updated.data };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId"));
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
    if (!ownerRole(access.role)) {
      return NextResponse.json(
        { success: false, error: "Organization owner access required" },
        { status: 403 },
      );
    }

    const existing = await loadConnection(access.organizationId);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Stripe merchant account is not connected" },
        { status: 404 },
      );
    }

    const synced = await syncConnection(access.organizationId, existing);
    const appOrigin = platformOrigin(request);
    const workspaceUrl =
      `${appOrigin}/workspace/${encodeURIComponent(access.organizationId)}`;

    if (
      url.searchParams.get("refresh") === "1" ||
      (!synced.account.details_submitted && url.searchParams.get("return") !== "1")
    ) {
      const link = await StripeProvider.createConnectedAccountOnboardingLink({
        organizationId: access.organizationId,
        connectedAccountId: synced.account.id,
        refreshUrl:
          `${appOrigin}/api/payments/onboarding/stripe?organizationId=${encodeURIComponent(access.organizationId)}&refresh=1`,
        returnUrl:
          `${appOrigin}/api/payments/onboarding/stripe?organizationId=${encodeURIComponent(access.organizationId)}&return=1`,
      });

      return NextResponse.redirect(link.url);
    }

    if (url.searchParams.get("return") === "1") {
      return NextResponse.redirect(
        `${workspaceUrl}?paymentSetup=stripe-complete`,
      );
    }

    return NextResponse.json({
      success: true,
      provider: "stripe",
      status: synced.connection.status,
      chargesEnabled: synced.connection.charges_enabled,
      payoutsEnabled: synced.connection.payouts_enabled,
      detailsSubmitted: synced.connection.details_submitted,
    });
  } catch (error) {
    console.error("STRIPE_ORGANIZATION_ONBOARDING_ERROR", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Stripe payment onboarding failed",
      },
      { status: 500 },
    );
  }
}
