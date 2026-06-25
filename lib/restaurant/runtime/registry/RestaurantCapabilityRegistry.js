const registry = new Map();

export function registerRestaurantCapability(
  contract
) {
  registry.set(
    `${contract.boundedContext}.${contract.capability}`,
    contract
  );

  return contract;
}

export function getRestaurantCapability(
  boundedContext,
  capability
) {
  return registry.get(
    `${boundedContext}.${capability}`
  );
}

export function getRestaurantCapabilities() {
  return [...registry.values()];
}
