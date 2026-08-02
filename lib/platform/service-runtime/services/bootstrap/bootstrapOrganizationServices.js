import {
  save as saveOrganizationService,
} from "../repositories/OrganizationServiceRepository";

import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  MANAGED_PLATFORM_SERVICE_CATEGORIES,
} from "@/lib/platform/service-runtime/services/catalog/ManagedPlatformServiceCatalog";

function serviceCategories() {
  return [
    ...SERVICE_CATALOG,
    ...MANAGED_PLATFORM_SERVICE_CATEGORIES,
  ];
}

export async function bootstrapOrganizationServices({
  organization_id,
  industry_id = "default",
  managed_by = "avantiqo",
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const created = [];

  for (const category of serviceCategories()) {
    for (const service of category.services || []) {
      if (!service.default_enabled) continue;

      const record = await saveOrganizationService({
        organization_id,
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
        },
        fallback_enabled: false,
        billing_mode: service.billing_mode || "USAGE",
        pricing_mode: service.pricing_mode || "PROVIDER",
        budget_limit: 0,
        budget_used: 0,
        hard_budget_limit: false,
        default_currency: null,
        configuration: {},
        total_requests: 0,
        total_failures: 0,
        total_cost: 0,
      });

      created.push(record);
    }
  }

  return {
    success: true,
    services: created,
    count: created.length,
  };
}
