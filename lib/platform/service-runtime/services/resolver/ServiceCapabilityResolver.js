import {
  SERVICE_CATALOG,
} from "@/lib/platform/registry/business-services/BusinessServiceRegistry";

import {
  getPlatformAIService,
} from "@/lib/platform/service-runtime/ai/PlatformAIServiceCatalog";

import {
  getManagedPlatformService,
} from "@/lib/platform/service-runtime/services/catalog/ManagedPlatformServiceCatalog";

const PLATFORM_SERVICE_ALIASES = Object.freeze({
  "ai.video.first_last_frame_to_video": Object.freeze({
    catalog_service_id: "ai.video.keyframe_to_video",
    execution_capabilities: Object.freeze([
      "ai.video.first_last_frame_to_video",
    ]),
  }),
});

function executionCapabilities(service = {}) {
  return (
    service.execution_capabilities ||
    service.executionCapabilities ||
    service.requires ||
    []
  );
}

function aliasedPlatformService(serviceId) {
  const alias = PLATFORM_SERVICE_ALIASES[serviceId];
  if (!alias) return null;
  const service = getPlatformAIService(alias.catalog_service_id);
  if (!service) return null;
  return {
    ...service,
    id: serviceId,
    execution_capabilities: [...alias.execution_capabilities],
    alias_of: alias.catalog_service_id,
  };
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

  const platformService =
    getPlatformAIService(serviceId) || aliasedPlatformService(serviceId);

  if (platformService) {
    return {
      service_id: platformService.id,
      name: platformService.name,
      package: null,
      capabilities: executionCapabilities({
        ...platformService,
        execution_capabilities:
          platformService.execution_capabilities || [platformService.id],
      }),
      requirements: platformService.requires || [],
      source: platformService.alias_of
        ? "platform_ai_service_alias"
        : "platform_ai_service",
      alias_of: platformService.alias_of || null,
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
