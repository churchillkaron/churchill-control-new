import {
  OrganizationServiceRuntime,
} from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import {
  resolveServiceCapabilities,
} from "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

// What an organization can actually produce with. This lived privately inside the universal
// executor, so the temporal executor -- every film -- had no access to it and named a capability
// literally in its prompt instead: "service": "ai.video.generate" written into the shot skeleton.
// That is a hardcoded provider capability in a runtime that is supposed to resolve everything from
// the organization, and it fails outright for any organization whose video capability is registered
// under a different id or is not enabled at all. Both executors now resolve from here.
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

  // An organization can have a service ACTIVE and usage-enabled that resolves to no
  // capability at all -- no catalog entry, no provider advertising it. Those were
  // dropped silently, so the service looked enabled everywhere the organization
  // could see it while being invisible to the director. A model planning against
  // the brief would reach for it anyway (ai.sfx.generate for a sound package, for
  // instance) and the decision gate rejected the plan on
  // PRODUCTION_SERVICE_NOT_ENABLED for a service the organization does have.
  //
  // They stay excluded from the executable list -- planning against something no
  // provider can run would only move the failure to dispatch -- but they are no
  // longer silent: they travel as explicitly unexecutable so the director is told
  // not to plan against them, and so the gap is visible rather than inferred from a
  // rejected plan.
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

  return { capabilities: resolved, unexecutable };
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
