export function createBusinessDomainContract(config) {
  return config;
}

export function createBoundedContext(config) {
  return config;
}

export function createDomainRegistry(config) {
  return {
    boundedContexts: config?.boundedContexts || [],
    ...config,
  };
}

// 🔧 COMPATIBILITY EXPORTS (FIX OLD SYSTEM)
export const RestaurantDomainContract = createBusinessDomainContract;
export const HotelDomainContract = createBusinessDomainContract;
export const RetailDomainContract = createBusinessDomainContract;
export const HealthcareDomainContract = createBusinessDomainContract;
