import { BusinessDomainContracts } from "@/lib/business-contracts";

function collectEvents() {
  const events = [];

  for (const domain of BusinessDomainContracts) {
    for (const context of domain.boundedContexts || []) {
      for (const event of context.events || []) {
        events.push({
          id: event,
          domain: domain.id,
          boundedContext: context.id,
          workflows: context.workflows || [],
          capabilities: context.capabilities || [],
          documents: context.documents || [],
          aggregates: context.aggregates || [],
        });
      }
    }
  }

  return events;
}

const ALL = collectEvents();

export const EventRegistry = {
  all() {
    return ALL;
  },

  get(id) {
    return ALL.find(e => e.id === id) || null;
  },

  byDomain(domainId) {
    return ALL.filter(e => e.domain === domainId);
  },

  byContext(contextId) {
    return ALL.filter(
      e => e.boundedContext === contextId
    );
  },
};
