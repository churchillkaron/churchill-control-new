import { financeGateway } from "@/lib/finance/gateway/financeGateway";

export async function postPaymentAccounting(payload) {
  return await financeGateway({
    type: "PAYMENT_RECEIVED",
    payload
  });
}
