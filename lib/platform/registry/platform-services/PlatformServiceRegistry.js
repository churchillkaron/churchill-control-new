

import {
  PLATFORM_AI_SERVICES,
} from "@/lib/platform/service-runtime/ai/PlatformAIServiceCatalog";
export const PLATFORM_SERVICE_REGISTRY = [

  ...PLATFORM_AI_SERVICES,

  {
    id: "wallet",
    name: "Wallet",
  },

  {
    id: "budgets",
    name: "Budgets",
  },

  {
    id: "usage",
    name: "Usage",
  },

  {
    id: "billing",
    name: "Billing",
  },

  {
    id: "pricing",
    name: "Pricing",
  },

  {
    id: "audit",
    name: "Audit",
  },

];
