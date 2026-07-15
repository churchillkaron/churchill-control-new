import { CrmRuntime } from "@/lib/commercial/crm/runtime/CrmRuntime";
import { salesRuntime } from "@/lib/commercial/runtime/sales";
import { MarketingRuntime } from "@/lib/marketing/runtime/MarketingRuntime";

export function buildCommercialRuntime(context = {}) {
  return {
    domain: "commercial",

    crm: CrmRuntime,

    sales: {
      execute: salesRuntime,
    },

    marketing: MarketingRuntime,

    context,
  };
}

export default buildCommercialRuntime;
