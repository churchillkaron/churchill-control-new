import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function processOrderProduction({
  order_id,
  items,
  organization_id
}) {

  if (!order_id || !items?.length) return;

  return await productionFinanceContract({
    type: "PRODUCTION_POSTED",
    payload: {
      order_id,
      items,
      organization_id
    }
  });
}
