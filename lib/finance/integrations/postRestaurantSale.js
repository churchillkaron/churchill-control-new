import { postAccountingEvent } from "@/lib/finance/postAccountingEvent";

export async function postRestaurantSale({
  tenantId,
  orderId,
  totalAmount,
  taxAmount,
  accounts,
}) {
  return await postAccountingEvent({
    tenantId,
    eventType: "SALE_COMPLETED",
    sourceModule: "restaurant_pos",
    sourceId: orderId,
    description: `Restaurant sale ${orderId}`,
    amount: totalAmount,
    taxAmount,
    accounts,
    metadata: {
      orderId,
    },
  });
}
