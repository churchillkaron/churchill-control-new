import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import {
  createJournalEntry,
} from "@/lib/finance/accounting/createJournalEntry";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function createCogsWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] CREATE_COGS",
    payload?.saleId
  );

  const tenantId =
    payload?.tenantId;

  const cogsAmount =
    Number(
      payload?.cogsAmount || 0
    );

  if (cogsAmount <= 0) {

    return {
      success: true,
      skipped: true,
      reason: "NO_COGS",
    };

  }

  const {
    data: accounts,
  } = await supabaseAdmin

    .from("chart_of_accounts")

    .select("*");

  const cogsAccount =
    accounts?.find(
      (a) =>
        a.code === "5000"
    );

  const inventoryAccount =
    accounts?.find(
      (a) =>
        a.code === "1350"
    );

  if (
    !cogsAccount ||
    !inventoryAccount
  ) {

    throw new Error(
      "COGS or Inventory account missing"
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
        `COGS ${payload?.saleId}`,

      sourceType:
        "cogs",

      sourceId:
        payload?.saleId,

      createdBy:
        payload?.createdBy || "system",

      lines: [

        {

          account_id:
            cogsAccount.id,

          debit:
            cogsAmount,

          credit:
            0,

          description:
            "COGS",

        },

        {

          account_id:
            inventoryAccount.id,

          debit:
            0,

          credit:
            cogsAmount,

          description:
            "Inventory depletion",

        },

      ],

    });

  return {

    success: true,

    workflow:
      "createCogsWorkflow",

    journal,

  };

}

registerWorkflow(

  "CREATE_COGS",

  createCogsWorkflow

);
