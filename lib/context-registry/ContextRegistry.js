import { BusinessDomainContracts } from "@/lib/business-contracts";

function collectContexts() {
  const contexts = [];

  for (const domain of BusinessDomainContracts) {
    for (const context of domain.boundedContexts || []) {
      contexts.push({
        ...context,
        domain: domain.id,
      });
    }
  }

  return contexts;
}

const ALL = collectContexts();

export const ContextRegistry = {
  all() {
    return ALL;
  },

  get(id) {
    return ALL.find(
      c => c.id === id
    ) || null;
  },

  byDomain(domainId) {
    return ALL.filter(
      c => c.domain === domainId
    );
  },
};
