import { BusinessDomainContracts } from "@/lib/business-contracts";

function collectAgents() {
  const agents = [];

  for (const domain of BusinessDomainContracts) {
    const ai = domain.ai || {};

    agents.push({
      id: ai.id || `${domain.id}-ai`,
      name: ai.name || `${domain.id} AI`,
      domain: domain.id,
      capabilities: ai.capabilities || [],
      documents: ai.documents || [],
      workflows: ai.workflows || [],
      events: ai.events || [],
      integrations: ai.integrations || [],
    });
  }

  return agents;
}

const ALL = collectAgents();

export const AIRegistry = {
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
};
