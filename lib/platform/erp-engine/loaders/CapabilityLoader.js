import {
  ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry";

function allCapabilities() {

  return Object.values(ERP_REGISTRY)
    .flatMap(domain => domain.groups || [])
    .flatMap(group => group.items || []);

}

export function loadCapabilityById(id) {

  return allCapabilities().find(
    capability => capability.id === id
  ) || null;

}

export function loadCapabilityByRoute(route) {

  return allCapabilities().find(
    capability => capability.route === route
  ) || null;

}

export function loadCapabilitiesByDomain(domainId) {

  const domain =
    ERP_REGISTRY[domainId];

  if (!domain) {
    return [];
  }

  return (domain.groups || [])
    .flatMap(group => group.items || []);

}
