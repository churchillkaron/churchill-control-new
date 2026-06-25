import { BusinessDomainContracts } from "@/lib/business-contracts";

function collectAggregates() {
  const aggregates = [];

  for (const domain of BusinessDomainContracts) {
    for (const context of domain.boundedContexts || []) {
      for (const aggregate of context.aggregates || []) {
        aggregates.push({
          id: aggregate,
          domain: domain.id,
          boundedContext: context.id,
          documents: context.documents || [],
          capabilities: context.capabilities || [],
          workflows: context.workflows || [],
          events: context.events || [],
        });
      }
    }
  }

  return aggregates;
}

const ALL = collectAggregates();

export const AggregateRegistry = {
  all() {
    return ALL;
  },

  get(id) {
    return ALL.find(
      a => a.id === id
    ) || null;
  },

  byDomain(domainId) {
    return ALL.filter(
      a => a.domain === domainId
    );
  },

  byContext(contextId) {
    return ALL.filter(
      a => a.boundedContext === contextId
    );
  },
};
