export function createBusinessDomainContract({
  id,
  name,
  industry = "generic",
  status = "SCAFFOLDED",
  boundedContexts = [],
}) {
  return {
    id,
    name,
    industry,
    status,
    boundedContexts,
  };
}

export function createBoundedContext({
  id,
  name,
  documents = [],
  aggregates = [],
  capabilities = [],
  workflows = [],
  events = [],
  reports = [],
}) {
  return {
    id,
    name,
    documents,
    aggregates,
    capabilities,
    workflows,
    events,
    reports,
  };
}
