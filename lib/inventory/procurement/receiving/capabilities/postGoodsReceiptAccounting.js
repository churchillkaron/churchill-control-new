import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function postGoodsReceiptAccounting(payload) {
  return await procurementFinanceContract({
    type: "GOODS_RECEIPT_POSTED",
    payload
  });
}
