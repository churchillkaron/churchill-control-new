import {
  getServiceCatalog,
} from "../../integrations/registry/IntegrationRegistry";

import * as OrganizationServiceRepository
from "../repositories/OrganizationServiceRepository";

function resolveServiceStatus({
  organizationService,
  catalogService,
}) {
  if (!organizationService) {
    return "NOT_CONFIGURED";
  }

  if (organizationService.status) {
    return organizationService.status;
  }

  if (catalogService.authorization === "NONE") {
    return "AVAILABLE";
  }

  return "PENDING_SETUP";
}

function resolvePackage({
  organizationService,
  catalogService,
}) {
  return (
    organizationService?.package_id ||
    catalogService.package ||
    null
  );
}

function resolveHealth({
  organizationService,
}) {
  return (
    organizationService?.health ||
    null
  );
}

export async function resolveOrganizationServices({
  organizationId,
}) {
  const catalog =
    getServiceCatalog();

  const organizationServices =
    await OrganizationServiceRepository
      .listByOrganization(
        organizationId
      );

  const serviceMap =
    new Map(
      organizationServices.map(service => [
        service.service_id,
        service,
      ])
    );

  return catalog.map(category => ({
    id: category.id,
    name: category.name,
    icon: category.icon || null,
    order: category.order || 0,

    services: category.services.map(service => {
      const organizationService =
        serviceMap.get(service.id) || null;

      return {
        id: service.id,
        name: service.name,
        icon: service.icon || null,

        status: resolveServiceStatus({
          organizationService,
          catalogService: service,
        }),

        package_id: resolvePackage({
          organizationService,
          catalogService: service,
        }),

        managed_by:
          organizationService?.managed_by ||
          service.managed_by ||
          "AVANTIQO",

        authorization:
          service.authorization || "NONE",

        authorization_required:
          Boolean(
            organizationService
              ?.authorization_required
          ),

        usage_enabled:
          Boolean(
            organizationService?.usage_enabled
          ),

        billing_enabled:
          Boolean(
            organizationService?.billing_enabled
          ),

        health: resolveHealth({
          organizationService,
        }),

        providers:
          service.providers || [],

        organization_service_id:
          organizationService?.id || null,
      };
    }),
  }));
}
