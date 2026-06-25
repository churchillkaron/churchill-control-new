import {
  BusinessDomainContracts,
} from "@/lib/business-contracts";

export const DomainRegistry = {
  getDomains() {
    return BusinessDomainContracts;
  },

  getDomain(domainId) {
    return BusinessDomainContracts.find(
      domain => domain.id === domainId
    ) || null;
  },

  getBoundedContexts(domainId) {
    const domain = this.getDomain(domainId);

    return domain?.boundedContexts || [];
  },

  getDocuments(domainId) {
    return this.getBoundedContexts(domainId)
      .flatMap(context => context.documents || []);
  },

  getAggregates(domainId) {
    return this.getBoundedContexts(domainId)
      .flatMap(context => context.aggregates || []);
  },

  getCapabilities(domainId) {
    return this.getBoundedContexts(domainId)
      .flatMap(context => context.capabilities || []);
  },

  getWorkflows(domainId) {
    return this.getBoundedContexts(domainId)
      .flatMap(context => context.workflows || []);
  },

  getEvents(domainId) {
    return this.getBoundedContexts(domainId)
      .flatMap(context => context.events || []);
  },

  getReports(domainId) {
    return this.getBoundedContexts(domainId)
      .flatMap(context => context.reports || []);
  },
};
