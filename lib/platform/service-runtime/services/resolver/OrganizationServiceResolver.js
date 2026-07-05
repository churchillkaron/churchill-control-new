import {
  SERVICE_CATALOG,
  getServiceCategory,
  getService,
} from "../../../registry/business-services/BusinessServiceRegistry";

import {
  getProvider,
  getProvidersForService,
} from "../../../registry/providers/ProviderRegistry";

import {
  listByOrganization,
} from "../repositories/OrganizationServiceRepository";

import {
  listOrganizationServiceProviders,
} from "../providers/OrganizationServiceProviderRepository";

function isEnabled(status) {
  return [
    "enabled",
    "active",
    "ACTIVE",
    "ENABLED",
  ].includes(status);
}

function normalizeProviderConnection(connection) {
  if (!connection) {
    return null;
  }

  return {
    ...connection,
    status:
      connection.provider_status ||
      connection.status ||
      "not_connected",

    authorization_status:
      connection.authorization_status ||
      "not_authorized",

    health:
      connection.health ||
      "unknown",
  };
}

export async function resolveOrganizationServices({ organization_id }) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const organizationServices =
    await listByOrganization(organization_id);

  const providerConnections =
    await listOrganizationServiceProviders({
      organization_id,
    });

  return SERVICE_CATALOG.map((category) => ({
    ...category,

    services: category.services.map((service) => {
      const organizationService =
        organizationServices.find(
          (row) =>
            row.service_category_id === category.id &&
            row.service_id === service.id
        ) || null;

      const serviceProviderConnections =
        providerConnections.filter(
          (row) =>
            row.organization_service_id === organizationService?.id
        );

      const providers =
        getProvidersForService(service).map((providerCatalog) => {
          const connection =
            normalizeProviderConnection(
              serviceProviderConnections.find(
                (row) => row.provider_id === providerCatalog.id
              )
            );

          return {
            ...providerCatalog,
            connection,
            status: connection?.status || "not_connected",
            authorization_status:
              connection?.authorization_status || "not_authorized",
            health: connection?.health || "unknown",
            connected: connection?.status === "connected",
          };
        });

      return {
        ...service,
        organization_service: organizationService,
        organization_service_id: organizationService?.id || null,
        enabled: isEnabled(organizationService?.status),
        status: organizationService?.status || "not_enabled",
        health: organizationService?.health || "unknown",
        package:
          organizationService?.package_id ||
          service.package ||
          "core",
        managed_by:
          organizationService?.managed_by ||
          "AVANTIQO",
        usage_enabled:
          organizationService?.usage_enabled === true,
        billing_enabled:
          organizationService?.billing_enabled === true,
        authorization_required:
          organizationService?.authorization_required === true,
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
  const categories =
    await resolveOrganizationServices({
      organization_id,
    });

  const category =
    categories.find(
      (item) => item.id === category_id
    ) || null;

  const service =
    category?.services.find(
      (item) => item.id === service_id
    ) || null;

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
  const { category, service } =
    await resolveOrganizationService({
      organization_id,
      category_id,
      service_id,
    });

  const provider =
    service?.providers.find(
      (item) => item.id === provider_id
    ) || null;

  return {
    category,
    service,
    provider,
  };
}

export function resolveCatalogPath({
  category_id,
  service_id,
  provider_id,
}) {
  const category =
    getServiceCategory(category_id);

  const service =
    service_id
      ? getService(category_id, service_id)
      : null;

  const provider =
    provider_id
      ? getProvider(provider_id)
      : null;

  return {
    category,
    service,
    provider,
  };
}
