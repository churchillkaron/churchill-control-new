import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function vendorPaymentWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] VENDOR_PAYMENT",
    payload?.paymentId
  );

  const tenantId =
    payload?.tenantId;

  const amount =
    Number(
      payload?.amount || 0
    );

  if (amount <= 0) {

    throw new Error(
      "INVALID_PAYMENT_AMOUNT"
    );

  }

  const {
    data: accounts,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*");

  const apAccount =
    accounts?.find(
      (a) =>
        a.code === "2000"
    );

  const cashAccount =
    accounts?.find(
      (a) =>
        a.code === "1000"
    );

  if (
    !apAccount ||
    !cashAccount
  ) {

    throw new Error(
      "AP or Cash account missing"
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
        `Vendor Payment ${payload?.paymentId}`,

      sourceType:
        "vendor_payment",

      sourceId:
        payload?.paymentId,

      createdBy:
        payload?.createdBy || "system",

      lines: [

        {

          account_id:
            apAccount.id,

          debit:
            amount,

          credit:
            0,

          description:
            "Reduce AP",

        },

        {

          account_id:
            cashAccount.id,

          debit:
            0,

          credit:
            amount,

          description:
            "Cash payment",

        },

      ],

    });

  return {

    success: true,

    workflow:
      "vendorPaymentWorkflow",

    journal,

  };

}

registerWorkflow(

  "VENDOR_PAYMENT",

  vendorPaymentWorkflow

);
