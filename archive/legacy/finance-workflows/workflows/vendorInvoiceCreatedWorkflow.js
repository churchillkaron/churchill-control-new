import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function vendorInvoiceCreatedWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] VENDOR_INVOICE_CREATED",
    payload?.invoiceId
  );

  const tenantId =
    payload?.tenantId;

  const amount =
    Number(
      payload?.amount || 0
    );

  if (amount <= 0) {

    throw new Error(
      "INVALID_INVOICE_AMOUNT"
    );

  }

  const {
    data: accounts,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*");

  const expenseAccount =
    accounts?.find(
      (a) =>
        a.code === "6100"
    );

  const apAccount =
    accounts?.find(
      (a) =>
        a.code === "2000"
    );

  if (
    !expenseAccount ||
    !apAccount
  ) {

    throw new Error(
      "Expense or AP account missing"
    );

  }

  const journal =
    await createJournalEntry({

      tenantId,

      entryDate:
        new Date()
          .toISOString()
          .slice(0, 10),

      description:
        `Vendor Invoice ${payload?.invoiceId}`,

      sourceType:
        "vendor_invoice",

      sourceId:
        payload?.invoiceId,

      createdBy:
        payload?.createdBy || "system",

      lines: [

        {

          account_id:
            expenseAccount.id,

          debit:
            amount,

          credit:
            0,

          description:
            "Vendor expense",

        },

        {

          account_id:
            apAccount.id,

          debit:
            0,

          credit:
            amount,

          description:
            "Accounts payable",

        },

      ],

    });

  return {

    success: true,

    workflow:
      "vendorInvoiceCreatedWorkflow",

    journal,

  };

}

registerWorkflow(

  "VENDOR_INVOICE_CREATED",

  vendorInvoiceCreatedWorkflow

);
