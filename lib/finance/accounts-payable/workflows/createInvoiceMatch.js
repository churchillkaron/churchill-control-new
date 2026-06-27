import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function createInvoiceMatch(payload) {
  return await financeGateway({
    type: "INVOICE_LEDGER",
    payload
  });
}
