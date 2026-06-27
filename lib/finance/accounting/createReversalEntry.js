import { financeGateway } from "../gateway/financeGateway";

/**
 * REVERSAL → EVENT ONLY ENTRY
 */

export async function createReversalEntry(payload) {
  return await financeGateway({
    type: "REVERSAL_ENTRY",
    payload
  });
}
