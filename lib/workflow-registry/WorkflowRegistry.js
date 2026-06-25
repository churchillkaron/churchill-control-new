import { BusinessDomainContracts } from "@/lib/business-contracts";

function collectWorkflows() {
  const workflows = [];

  for (const domain of BusinessDomainContracts) {
    for (const context of domain.boundedContexts || []) {
      for (const workflow of context.workflows || []) {
        workflows.push({
          id: workflow,
          domain: domain.id,
          boundedContext: context.id,
          capabilities: context.capabilities || [],
          documents: context.documents || [],
          aggregates: context.aggregates || [],
          events: context.events || [],
        });
      }
    }
  }

  return workflows;
}

const ALL = collectWorkflows();

export const WorkflowRegistry = {
  all() {
    return ALL;
  },

  get(id) {
    return ALL.find(w => w.id === id) || null;
  },

  byDomain(domainId) {
    return ALL.filter(w => w.domain === domainId);
  },

  byContext(contextId) {
    return ALL.filter(
      w => w.boundedContext === contextId
    );
  },
};
