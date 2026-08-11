import {
  save as saveOrganizationService,
} from "../repositories/OrganizationServiceRepository";

import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  MANAGED_PLATFORM_SERVICE_CATEGORIES,
} from "@/lib/platform/service-runtime/services/catalog/ManagedPlatformServiceCatalog";

import {
  supabaseAdmin,
} from "@/lib/shared/supabase/admin";

function serviceCategories() {
  return [
    ...SERVICE_CATALOG,
    ...MANAGED_PLATFORM_SERVICE_CATEGORIES,
  ];
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

async function billingContext(organizationId) {
  const { data, error } = await supabaseAdmin.rpc(
    "resolve_organization_billing_context",
    {
      p_organization_id: organizationId,
    },
  );

  if (error) throw new Error(error.message);

  const row = Array.isArray(data)
    ? data[0] || null
    : data || null;

  return {
    entity_id: row?.entity_id || null,
    currency: upper(row?.currency) || null,
  };
}

export async function bootstrapOrganizationServices({
  organization_id,
  industry_id = "default",
  managed_by = "avantiqo",
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const context = await billingContext(organization_id);
  const created = [];

  for (const category of serviceCategories()) {
    for (const service of category.services || []) {
      if (!service.default_enabled) continue;

      const billingMode = service.billing_mode || "USAGE";
      const pricingMode = service.pricing_mode || "PROVIDER";
      const managedMedia = upper(billingMode) === "PREPAID_MANAGED_MEDIA";

      const record = await saveOrganizationService({
        organization_id,
        entity_id: context.entity_id,
        service_category_id: category.id,
        service_id: service.id,
        package_id: service.package || "core",
        status: "ACTIVE",
        managed_by: service.managed_by || managed_by,
        authorization_required:
          service.authorization_required !== false,
        usage_enabled: service.usage_enabled !== false,
        billing_enabled: service.billing_enabled !== false,
        health: "UNKNOWN",
        activated_at: new Date().toISOString(),
        metadata: {
          industry_id,
          description: service.description || null,
          provider: service.provider || null,
          connection_model: service.connection_model || null,
          billing_owner: "AVANTIQO",
          provider_billed_to: "AVANTIQO",
          customer_payment_source: "AVANTIQO_PREPAID_WALLET",
          prepaid_required: true,
          customer_direct_provider_billing_allowed: false,
          customer_provider_payment_method_allowed: false,
          ...(managedMedia
            ? { media_spend_authorized: false }
            : {}),
        },
        fallback_enabled: false,
        billing_mode: billingMode,
        pricing_mode: pricingMode,
        budget_limit: 0,
        budget_used: 0,
        hard_budget_limit: managedMedia,
        default_currency: context.currency,
        configuration: {
          billing_owner: "AVANTIQO",
          customer_payment_source: "AVANTIQO_PREPAID_WALLET",
          prepaid_required: true,
          ...(managedMedia
            ? { media_spend_authorized: false }
            : {}),
        },
        total_requests: 0,
        total_failures: 0,
        total_cost: 0,
      });

      created.push(record);
    }
  }

  return {
    success: true,
    billing_contract: {
      billing_owner: "AVANTIQO",
      customer_payment_source: "AVANTIQO_PREPAID_WALLET",
      prepaid_required: true,
      entity_id: context.entity_id,
      currency: context.currency,
    },
    services: created,
    count: created.length,
  };
}
