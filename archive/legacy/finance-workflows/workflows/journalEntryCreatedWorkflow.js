import {
  registerWorkflow,
} from "@/lib/workflows/workflowRegistry";

import postJournalToLedger
from "@/lib/finance/general-ledger/postJournalToLedger";

export async function journalEntryCreatedWorkflow(
  payload
) {

  console.log(
    "[WORKFLOW] JOURNAL_ENTRY_CREATED",
    payload?.journalEntryId
  );

  const result =
    await postJournalToLedger({

      tenantId:
        payload?.tenantId,

      journalEntryId:
        payload?.journalEntryId,

      createdBy:
        payload?.createdBy || "system",

    });

  if (!result.success) {

    throw new Error(
      result.error
    );

  }

  return {

    success: true,

    workflow:
      "journalEntryCreatedWorkflow",

    ledger:
      result,

  };

}

registerWorkflow(

  "JOURNAL_ENTRY_CREATED",

  journalEntryCreatedWorkflow

);
