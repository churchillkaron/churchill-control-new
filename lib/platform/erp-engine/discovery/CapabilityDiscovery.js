import {
  loadCapabilitiesByDomain,
} from "../loaders/CapabilityLoader";

export function discoverDomain(domainId) {

  return {

    capabilities:
      loadCapabilitiesByDomain(domainId),

  };

}
