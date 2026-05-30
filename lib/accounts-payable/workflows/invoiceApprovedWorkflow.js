import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import postInvoiceApprovalAccounting
from "@/lib/accounts-payable/accounting/postInvoiceApprovalAccounting";

export async function invoiceApprovedWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] INVOICE_APPROVED",
    payload?.invoiceId
  );

  const accountingResult =
    await postInvoiceApprovalAccounting({

      tenantId:
        payload?.tenantId,

      invoiceId:
        payload?.invoiceId,

      invoice:
        payload?.invoice,

      createdBy:
        payload?.approvedBy || "system",

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
      "invoiceApprovedWorkflow",

    accounting:
      accountingResult,

    invoiceId:
      payload?.invoiceId,

  };

}

registerWorkflow(

  "INVOICE_APPROVED",

  invoiceApprovedWorkflow

);
