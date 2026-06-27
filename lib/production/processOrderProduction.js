import { financeGateway } from "@/lib/finance/runtime/financeGateway";

/**
 * PRODUCTION ORDER PROCESSOR
 * NOW FINANCE-LOCKED VIA GATEWAY ONLY
 */

export async function processOrderProduction({
  order_id,
  items,
  tenant_id,
  organization_id
}) {

  if (!order_id || !items?.length) return;

  // =========================
  // FINANCE: COGS ONLY VIA GATEWAY
  // =========================

  await financeGateway({
    type: "COGS_TRIGGERED",
    payload: {
      order_id,
      items,
      tenant_id,
      organization_id
    }
  });

  return {
    success: true,
    message: "Production processed via finance gateway"
  };
}
