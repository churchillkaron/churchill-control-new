import { financeGateway } from "./gateway/financeGateway";

/**
 * COGS → EVENT ONLY ENTRY
 */

export async function createCogsEntry(payload) {
  return await financeGateway({
    type: "COGS_TRIGGERED",
    payload
  });
}
