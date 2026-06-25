import { BusinessDomainContracts } from "@/lib/business-contracts";

function collectDocuments() {
  const documents = [];

  for (const domain of BusinessDomainContracts) {
    for (const context of domain.boundedContexts || []) {
      for (const document of context.documents || []) {
        documents.push({
          id: document,
          domain: domain.id,
          boundedContext: context.id,
          aggregates: context.aggregates || [],
          capabilities: context.capabilities || [],
          workflows: context.workflows || [],
          events: context.events || [],
        });
      }
    }
  }

  return documents;
}

const ALL = collectDocuments();

export const DocumentRegistry = {
  all() {
    return ALL;
  },

  get(id) {
    return ALL.find(d => d.id === id) || null;
  },

  byDomain(domainId) {
    return ALL.filter(d => d.domain === domainId);
  },

  byContext(contextId) {
    return ALL.filter(
      d => d.boundedContext === contextId
    );
  },
};
