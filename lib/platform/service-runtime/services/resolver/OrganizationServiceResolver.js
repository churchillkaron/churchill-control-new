import {
  SERVICE_CATALOG,
  PROVIDER_CATALOG,
  getServiceCategory,
  getService,
  getProvider,
} from "../catalog/ServiceCatalog";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { listOrganizationServiceProviders } from "../providers/OrganizationServiceProviderRepository";

export async function resolveOrganizationServices({ organization_id }) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const { data: organizationServices, error } = await supabaseAdmin
    .from("organization_services")
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const providerConnections =
    await listOrganizationServiceProviders({ organization_id });

  return SERVICE_CATALOG.map((category) => ({
    ...category,
    services: category.services.map((service) => {
      const organizationService =
        (organizationServices || []).find(
          (row) =>
            row.category_id === category.id &&
            row.service_id === service.id
        ) || null;

      const providers = service.providers.map((providerId) => {
        const providerCatalog = PROVIDER_CATALOG[providerId] || {
          id: providerId,
          name: providerId,
          auth_type: "unknown",
        };

        const connection =
          providerConnections.find(
            (row) =>
              row.service_id === service.id &&
              row.provider_id === providerId
          ) || null;

        return {
          ...providerCatalog,
          connection,
          status: connection?.status || "not_connected",
          health: connection?.health || "unknown",
          connected: connection?.status === "connected",
        };
      });

      return {
        ...service,
        organization_service: organizationService,
        enabled: organizationService?.enabled === true,
        status: organizationService?.status || "not_enabled",
        health: organizationService?.health || "unknown",
        package: organizationService?.package || service.package || "core",
        providers,
      };
    }),
  }));
}

export async function resolveOrganizationService({
  organization_id,
  category_id,
  service_id,
}) {
  const categories = await resolveOrganizationServices({ organization_id });
  const category = categories.find((item) => item.id === category_id) || null;
  const service =
    category?.services.find((item) => item.id === service_id) || null;

  return {
    category,
    service,
  };
}

export async function resolveOrganizationProvider({
  organization_id,
  category_id,
  service_id,
  provider_id,
}) {
  const { category, service } = await resolveOrganizationService({
    organization_id,
    category_id,
    service_id,
  });

  const provider =
    service?.providers.find((item) => item.id === provider_id) || null;

  return {
    category,
    service,
    provider,
  };
}

export function resolveCatalogPath({ category_id, service_id, provider_id }) {
  const category = getServiceCategory(category_id);
  const service = service_id ? getService(category_id, service_id) : null;
  const provider = provider_id ? getProvider(provider_id) : null;

  return {
    category,
    service,
    provider,
  };
}
