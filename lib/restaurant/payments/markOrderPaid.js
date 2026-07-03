import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function markOrderPaid({
  order_id,
  organization_id,
  entity_id,
  amount
}) {

  if (!order_id || !organization_id) {
    throw new Error("Missing required payment context");
  }

  return await restaurantFinanceContract({
    type: "CUSTOMER_PAYMENT_RECEIVED",
    payload: {
      order_id,
      organization_id,
      entity_id,
      amount
    }
  });
}
