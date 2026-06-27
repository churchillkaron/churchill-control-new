import { financeGateway } from "../gateway/financeGateway";

/**
 * PAYMENT → EVENT ONLY ENTRY
 */

export async function postPaymentToLedger(payload) {
  return await financeGateway({
    type: "PAYMENT_RECEIVED",
    payload
  });
}
