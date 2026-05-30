import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import postPaymentAccounting
from "@/lib/payments/accounting/postPaymentAccounting";

export async function paymentCompletedWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] PAYMENT_COMPLETED",
    payload?.paymentId
  );

  const accountingResult =
    await postPaymentAccounting({

      tenantId:
        payload?.tenantId,

      paymentId:
        payload?.paymentId,

      payment:
        payload?.payment,

      createdBy:
        payload?.paidBy || "system",

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
      "paymentCompletedWorkflow",

    accounting:
      accountingResult,

    paymentId:
      payload?.paymentId,

  };

}

registerWorkflow(

  "PAYMENT_COMPLETED",

  paymentCompletedWorkflow

);
