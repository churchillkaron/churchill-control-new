import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getOrganizationModuleBillingCatalog } from "@/lib/billing/moduleBillingCatalog";
import { getStripeBillingAccount } from "@/lib/billing/stripeBillingAccounts";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const BILLING_OWNER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value) {
  return String(value ?? "").trim();
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organizationId") ||
      url.searchParams.get("organization_id"),
    );
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const billing = await getStripeBillingAccount(access.organizationId);
    const role = text(access.role).toUpperCase();

    let catalog = null;
    let catalogError = null;
    try {
      const [monthly, yearly] = await Promise.all([
        getOrganizationModuleBillingCatalog({
          organizationId: access.organizationId,
          billingCycle: "monthly",
          provider: "stripe",
        }),
        getOrganizationModuleBillingCatalog({
          organizationId: access.organizationId,
          billingCycle: "yearly",
          provider: "stripe",
        }),
      ]);
      catalog = {
        environment: monthly.environment,
        monthly: {
          currency: monthly.currency,
          total: monthly.total,
          modules: monthly.items.map((item) => item.module_id),
          unpricedModules: monthly.unpricedModules,
          missingMappings: monthly.missingMappings,
        },
        yearly: {
          currency: yearly.currency,
          total: yearly.total,
          modules: yearly.items.map((item) => item.module_id),
          unpricedModules: yearly.unpricedModules,
          missingMappings: yearly.missingMappings,
        },
      };
    } catch (catalogLoadError) {
      catalogError =
        catalogLoadError?.message || "Billing catalog could not be loaded";
    }

    return NextResponse.json({
      success: true,
      canManage: BILLING_OWNER_ROLES.has(role),
      catalog,
      catalogError,
      billing: billing
        ? {
            configured: true,
            status: billing.status,
            planKey: billing.plan_key,
            billingCycle: billing.metadata?.billing_cycle || null,
            moduleIds: Array.isArray(billing.metadata?.module_ids)
              ? billing.metadata.module_ids
              : [],
            currentPeriodEnd: billing.current_period_end,
            cancelAtPeriodEnd: billing.cancel_at_period_end,
            automaticTaxEnabled: billing.automatic_tax_enabled,
            latestInvoiceStatus: billing.latest_invoice_status,
            subscriptionConfigured: Boolean(billing.stripe_subscription_id),
          }
        : {
            configured: false,
            status: "NOT_CONFIGURED",
            planKey: null,
            billingCycle: null,
            moduleIds: [],
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            automaticTaxEnabled: false,
            latestInvoiceStatus: null,
            subscriptionConfigured: false,
          },
    });
  } catch (error) {
    console.error("BILLING_STATUS_ERROR", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Billing status could not be loaded" },
      { status: 500 },
    );
  }
}
