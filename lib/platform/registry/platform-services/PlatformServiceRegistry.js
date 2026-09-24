

import {
  PLATFORM_AI_SERVICES,
} from "../../service-runtime/ai/PlatformAIServiceCatalog.js";
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
