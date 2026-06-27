import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function postGoodsReceiptAccounting(payload) {
  return await financeGateway({
    type: "GOODS_RECEIPT_LEDGER",
    payload
  });
}
