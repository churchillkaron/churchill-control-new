import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import postGoodsReceiptAccounting
from "@/lib/procurement/accounting/postGoodsReceiptAccounting";

export async function goodsReceiptCreatedWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] GOODS_RECEIPT_CREATED",
    payload?.goodsReceiptId
  );

  const accountingResult =
    await postGoodsReceiptAccounting({

      tenantId:
        payload?.tenantId,

      goodsReceiptId:
        payload?.goodsReceiptId,

      purchaseOrder:
        payload?.purchaseOrder,

      createdBy:
        payload?.receivedBy || "system",

    });

  if (
    !accountingResult.success
  ) {

    throw new Error(
      accountingResult.error
    );

  }

  return {

    success: true,

    workflow:
      "goodsReceiptCreatedWorkflow",

    accounting:
      accountingResult,

    goodsReceiptId:
      payload?.goodsReceiptId,

    purchaseOrderId:
      payload?.purchaseOrderId,

  };

}

registerWorkflow(

  "GOODS_RECEIPT_CREATED",

  goodsReceiptCreatedWorkflow

);
