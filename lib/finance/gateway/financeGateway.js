import { postCOGS } from "../integrations/postCOGS";
import { postInvoiceToLedger } from "../accounting/postInvoiceToLedger";
import { postPaymentToLedger } from "../accounting/postPaymentToLedger";

/**
 * FINANCE GATEWAY (SINGLE ENTRY POINT)
 * ALL financial mutations must go through here
 */

export async function financeGateway(event) {
  const { type, payload } = event;

  switch (type) {

    case "COGS_TRIGGERED":
      return await postCOGS(payload);

    case "INVOICE_CREATED":
      return await postInvoiceToLedger(payload);

    case "PAYMENT_RECEIVED":
      return await postPaymentToLedger(payload);

    default:
      throw new Error(`Unknown finance event type: ${type}`);
  }
}
