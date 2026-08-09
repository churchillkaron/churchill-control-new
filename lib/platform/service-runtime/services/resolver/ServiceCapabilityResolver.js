import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  getPlatformAIService,
} from "@/lib/platform/service-runtime/ai/PlatformAIServiceCatalog";

import {
  getManagedPlatformService,
} from "@/lib/platform/service-runtime/services/catalog/ManagedPlatformServiceCatalog";

function executionCapabilities(service = {}) {
  return (
    service.execution_capabilities ||
    service.executionCapabilities ||
    service.requires ||
    []
  );
}

export function resolveServiceCapabilities(serviceId) {
  const managedService = getManagedPlatformService(serviceId);

  if (managedService) {
    return {
      service_id: managedService.id,
      name: managedService.name,
      package: managedService.package,
      capabilities: executionCapabilities(managedService),
      requirements: managedService.requires || [],
      source: "managed_platform_service",
      provider: managedService.provider || null,
      billing_mode: managedService.billing_mode || null,
      pricing_mode: managedService.pricing_mode || null,
      connection_model: managedService.connection_model || null,
    };
  }

  const platformService = getPlatformAIService(serviceId);

  if (platformService) {
    return {
      service_id: platformService.id,
      name: platformService.name,
      package: null,
      capabilities: executionCapabilities({
        ...platformService,
        execution_capabilities: platformService.execution_capabilities || [platformService.id],
      }),
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
        capabilities: executionCapabilities(service),
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
