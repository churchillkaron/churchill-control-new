import { financeGateway } from "../gateway/financeGateway";

/**
 * INVOICE → EVENT ONLY ENTRY
 */

export async function postInvoiceToLedger(payload) {
  return await financeGateway({
    type: "INVOICE_CREATED",
    payload
  });
}
