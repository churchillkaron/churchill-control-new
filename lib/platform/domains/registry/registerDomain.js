const registry = [];

export function registerDomain(config) {
  registry.push(config);
}

export function getRegisteredDomains() {
  return registry;
}
