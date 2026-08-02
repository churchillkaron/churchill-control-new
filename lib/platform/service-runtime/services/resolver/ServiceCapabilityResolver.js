import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  getPlatformAIService,
} from "@/lib/platform/service-runtime/ai/PlatformAIServiceCatalog";

const MANAGED_PLATFORM_SERVICES = {
  "meta-ads": {
    id: "meta-ads",
    name: "Managed Meta Advertising",
    package: "growth",
    requires: ["META_ADS"],
  },
};

export function resolveServiceCapabilities(serviceId) {
  const managedService = MANAGED_PLATFORM_SERVICES[serviceId] || null;

  if (managedService) {
    return {
      service_id: managedService.id,
      name: managedService.name,
      package: managedService.package,
      capabilities: managedService.requires,
      requirements: managedService.requires,
      source: "managed_platform_service",
    };
  }

  const platformService = getPlatformAIService(serviceId);

  if (platformService) {
    return {
      service_id: platformService.id,
      name: platformService.name,
      package: null,
      capabilities: [platformService.id],
      requirements: platformService.requires || [],
      source: "platform_ai_service",
    };
  }

  for (const category of SERVICE_CATALOG) {
    const service = (category.services || []).find((item) => item.id === serviceId);

    if (service) {
      return {
        service_id: service.id,
        name: service.name,
        package: service.package,
        capabilities: service.requires || [],
        requirements: service.requires || [],
        source: "service_catalog",
      };
    }
  }

  return null;
}

export function resolveOrganizationCapabilities(services = []) {
  return services.flatMap((service) => {
    const resolved = resolveServiceCapabilities(service.service_id);

    if (!resolved) return [];

    return [
      {
        ...resolved,
        status: service.status,
        organization_service_id: service.id,
      },
    ];
  });
}
