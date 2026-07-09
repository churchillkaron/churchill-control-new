import {
  createBusinessDomainContract,
  createBoundedContext,
  createDomainRegistry,
} from "./BusinessDomainContract";

// 🔥 REAL DOMAIN REGISTRY (must be iterable array)
export const BusinessDomainContracts = [
  createBusinessDomainContract({
    id: "restaurant",
    boundedContexts: [],
  }),
  createBusinessDomainContract({
    id: "hotel",
    boundedContexts: [],
  }),
  createBusinessDomainContract({
    id: "retail",
    boundedContexts: [],
  }),
  createBusinessDomainContract({
    id: "healthcare",
    boundedContexts: [],
  }),
];

export {
  createBusinessDomainContract,
  createBoundedContext,
  createDomainRegistry,
};
