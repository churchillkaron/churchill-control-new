import { CrmRuntime } from "@/lib/commercial/crm/runtime/CrmRuntime";
import { salesRuntime } from "@/lib/commercial/runtime/sales";
import { MarketingRuntime } from "@/lib/marketing/runtime/MarketingRuntime";

const COMMERCIAL_CAPABILITIES = {
  communication: {
    draftMessage: () =>
      import(
        "@/lib/commercial/communications/capabilities/draftMessage"
      ),
    sendDraftMessage: () =>
      import(
        "@/lib/commercial/communications/capabilities/sendDraftMessage"
      ),
  },
};

export function buildCommercialRuntime(context = {}) {
  return {
    domain: "commercial",

    name: "Commercial",

    version: "1.0.0",

    capabilities: COMMERCIAL_CAPABILITIES,

    crm: CrmRuntime,

    sales: {
      execute: salesRuntime,
    },

    marketing: MarketingRuntime,

    context,
  };
}

export default buildCommercialRuntime;
