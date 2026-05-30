import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function saleCompletedWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] SALE_COMPLETED",
    payload?.saleId
  );

  const tenantId =
    payload?.tenantId;

  const amount =
    Number(
      payload?.amount || 0
    );

  if (amount <= 0) {

    throw new Error(
      "INVALID_SALE_AMOUNT"
    );

  }

  const {
    data: accounts,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*");

  const cashAccount =
    accounts?.find(
      (a) =>
        a.code === "1000"
    );

  const revenueAccount =
    accounts?.find(
      (a) =>
        a.code === "4000"
    );

  if (
    !cashAccount ||
    !revenueAccount
  ) {

    throw new Error(
      "Cash or Revenue account missing"
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
        `POS Sale ${payload?.saleId}`,

      sourceType:
        "sale",

      sourceId:
        payload?.saleId,

      createdBy:
        payload?.createdBy || "system",

      lines: [

        {

          account_id:
            cashAccount.id,

          debit:
            amount,

          credit:
            0,

          description:
            "Cash received",

        },

        {

          account_id:
            revenueAccount.id,

          debit:
            0,

          credit:
            amount,

          description:
            "Sales revenue",

        },

      ],

    });

  const {
    emitEvent,
  } = await import(
    "@/lib/shared/events/eventBus"
  );

  await emitEvent(

    "CREATE_COGS",

    {

      tenantId,

      saleId:
        payload?.saleId,

      cogsAmount:
        amount * 0.35,

      createdBy:
        payload?.createdBy || "system",

    }

  );

  return {

    success: true,

    workflow:
      "saleCompletedWorkflow",

    journal,

  };

}

registerWorkflow(

  "SALE_COMPLETED",

  saleCompletedWorkflow

);
