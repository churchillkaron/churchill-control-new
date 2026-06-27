import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function postPaymentAccounting(payload) {
  return await financeGateway({
    type: "PAYMENT_RECEIVED",
    payload
  });
}
