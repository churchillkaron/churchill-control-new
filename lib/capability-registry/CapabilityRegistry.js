import { BusinessDomainContracts } from "@/lib/business-contracts";

function collect() {
  const capabilities = [];

  for (const domain of BusinessDomainContracts) {
    for (const context of domain.boundedContexts || []) {
      for (const capability of context.capabilities || []) {
        capabilities.push({
          id: capability,
          domain: domain.id,
          boundedContext: context.id,
          workflow: context.workflows || [],
          events: context.events || [],
          aggregates: context.aggregates || [],
          documents: context.documents || [],
        });
      }
    }
  }

  return capabilities;
}

const ALL = collect();

export const CapabilityRegistry = {
  all() {
    return ALL;
  },

  get(id) {
    return ALL.find(c => c.id === id) || null;
  },

  byDomain(domainId) {
    return ALL.filter(c => c.domain === domainId);
  },

  byDocument(document) {
    return ALL.filter(c => c.documents.includes(document));
  },

  byAggregate(aggregate) {
    return ALL.filter(c => c.aggregates.includes(aggregate));
  },
};
