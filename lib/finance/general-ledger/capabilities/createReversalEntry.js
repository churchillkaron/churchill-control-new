import { financeGateway } from "@/lib/finance/runtime/financeGateway";

/**
 * REVERSAL → EVENT ONLY ENTRY
 */

export async function createReversalEntry(payload) {
  return await financeGateway({
    type: "REVERSAL_ENTRY",
    payload
  });
}
