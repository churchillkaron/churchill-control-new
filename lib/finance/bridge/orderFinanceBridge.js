import { financeGateway } from "../gateway/financeGateway";
import { SYSTEM_EVENTS } from "@/lib/shared/constants/events";

/**
 * ORDER → FINANCE BRIDGE
 * Converts order lifecycle into accounting events
 */

export async function handleOrderFinanceEvent(event) {
  const { type, payload } = event;

  switch (type) {

    // When order is completed → generate COGS
    case SYSTEM_EVENTS.ORDER_COMPLETED:
      return await financeGateway({
        type: "COGS_TRIGGERED",
        payload
      });

    // When order is paid → generate payment entry
    case SYSTEM_EVENTS.ORDER_PAID:
      return await financeGateway({
        type: "PAYMENT_RECEIVED",
        payload
      });

    default:
      return null;
  }
}
