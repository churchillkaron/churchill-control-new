import * as OrganizationServices
from "../repositories/OrganizationServiceRepository";

import {
  resolveServiceCapabilities,
} from "./ServiceCapabilityResolver";

function resolveRequestedServiceIds(serviceId) {
  const resolved = resolveServiceCapabilities(serviceId);

  return new Set([
    serviceId,
    resolved?.service_id,
    resolved?.package_service_id,
  ].filter(Boolean));
}

function findOrganizationService(rows = [], serviceId) {
  const requestedIds = resolveRequestedServiceIds(serviceId);

  return rows.find(
    (service) => requestedIds.has(service.service_id),
  ) || null;
}

export async function resolveOrganizationServices({
  organization_id,
}) {
  const rows = await OrganizationServices.listByOrganization(
    organization_id,
  );
  const categories = {};

  for (const service of rows || []) {
    const categoryId =
      service.service_category_id ||
      "services";

    if (!categories[categoryId]) {
      categories[categoryId] = {
        id: categoryId,
        name: categoryId
          .replace(/-/g, " ")
          .replace(/\b\w/g, (character) => character.toUpperCase()),
        services: [],
      };
    }

    categories[categoryId].services.push({
      id: service.id,
      service_id: service.service_id,
      package_id: service.package_id,
      status: service.status,
      enabled: service.status === "ACTIVE",
      usage_enabled: service.usage_enabled,
      billing_enabled: service.billing_enabled,
    });
  }

  return Object.values(categories);
}

export async function resolveOrganizationService({
  organization_id,
  service_id,
}) {
  const rows = await OrganizationServices.listByOrganization(
    organization_id,
  );
  const service = findOrganizationService(
    rows || [],
    service_id,
  );

  if (!service) return null;

  return {
    ...service,
    requested_service_id: service_id,
    resolved_service_id: service.service_id,
  };
}

export async function resolveOrganizationServiceReadModel({
  organization_id,
}) {
  const categories = await resolveOrganizationServices({
    organization_id,
  });

  return categories.flatMap(
    (category) =>
      (category.services || []).map((service) => ({
        id: service.id,
        name: service.service_id,
        category: category.name,
        category_id: category.id,
        status: service.status,
        package: service.package_id,
      })),
  );
}
