import { financeGateway } from "./financeGateway";

/**
 * HARD FINANCE GATEWAY GUARD
 * Prevents direct finance execution bypass
 */

export async function secureFinance(event) {
  if (!event?.type) {
    throw new Error("FinanceGuard: missing event type");
  }

  if (!event?.payload?.entity_id) {
    throw new Error("FinanceGuard: entity_id required");
  }

  return await financeGateway(event);
}
