import { financeGateway } from "@/lib/finance/gateway/financeGateway";

export async function createInvoiceMatch(payload) {
  return await financeGateway({
    type: "INVOICE_LEDGER",
    payload
  });
}
