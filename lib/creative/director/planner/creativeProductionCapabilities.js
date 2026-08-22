import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";
import {
  listCreativeDesignCapabilities,
} from "@/lib/creative/design/registry/CreativeDesignCapabilityRegistry";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function localDesignCapabilityService() {
  return {
    organization_service_id: null,
    service_id: "creative.design",
    name: "Avantiqo Design & Composition",
    category_id: "creative-core",
    category_name: "Creative Core",
    source: "AVANTIQO_LOCAL_DETERMINISTIC",
    capabilities: listCreativeDesignCapabilities().map((entry) => entry.id),
    status: "ACTIVE",
    usage_enabled: true,
    billing_enabled: false,
    local_execution: true,
    provider_required: false,
  };
}

// What an organization can actually produce with. Provider-backed capabilities
// remain organization-enabled through Service Runtime. Avantiqo-owned deterministic
// production planes such as Design & Composition are injected here as core Studio
// capabilities because they do not depend on an external provider, credential or
// billable inference call. They remain organization-scoped at task execution time.
export async function availableProductionCapabilities(organizationId) {
  const categories = await OrganizationServiceRuntime.list(organizationId);
  const services = list(categories).flatMap((category) =>
    list(category?.services).map((service) => ({
      ...service,
      category_id: category.id || null,
      category_name: category.name || null,
    })),
  );

  const enabled = services.filter((service) =>
    text(service.status).toUpperCase() === "ACTIVE" &&
    service.usage_enabled !== false,
  );

  const unexecutable = [];

  const resolved = enabled.map((service) => {
    const capabilities = resolveServiceCapabilities(service.service_id);
    if (!capabilities?.service_id || !list(capabilities.capabilities).length) {
      unexecutable.push({
        service_id: service.service_id,
        organization_service_id: service.id || null,
        category_name: service.category_name,
        status: service.status,
        reason: capabilities?.service_id
          ? "SERVICE_RESOLVES_TO_NO_CAPABILITY"
          : "SERVICE_NOT_REGISTERED_IN_ANY_CATALOG",
      });
      return null;
    }
    return {
      organization_service_id: service.id || null,
      service_id: capabilities.service_id,
      name: capabilities.name || service.service_id,
      category_id: service.category_id,
      category_name: service.category_name,
      source: capabilities.source || null,
      capabilities: list(capabilities.capabilities),
      status: service.status,
      usage_enabled: service.usage_enabled !== false,
      billing_enabled: service.billing_enabled !== false,
    };
  }).filter(Boolean);

  if (!resolved.some((service) => service.service_id === "ai.reasoning.execute")) {
    throw new Error("CREATIVE_REASONING_SERVICE_NOT_ENABLED");
  }

  const capabilities = [
    ...resolved,
    localDesignCapabilityService(),
  ];

  return { capabilities, unexecutable };
}

// The service/capability pairs a plan is allowed to name, as flat strings the prompt can list and a
// validator can compare against. The temporal path needs this to tell a director what it may plan
// against without naming anything itself.
export function productionCapabilityPairs(capabilities = []) {
  const pairs = [];
  for (const service of list(capabilities)) {
    for (const capability of list(service.capabilities)) {
      const capabilityId = text(capability?.capability_id || capability?.id || capability);
      if (!capabilityId) continue;
      pairs.push({
        service: text(service.service_id),
        capability: capabilityId,
        name: text(service.name || service.service_id),
        category: text(service.category_name),
      });
    }
  }
  return pairs;
}
