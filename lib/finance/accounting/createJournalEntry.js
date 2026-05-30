 import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import { validateAccountingPeriod }
from "./validateAccountingPeriod";

import { checkFinancePermission }
from "@/lib/shared/auth/checkFinancePermission";

import {
  emitEvent,
} from "@/lib/shared/events/eventBus";

// =====================================
// CREATE JOURNAL ENTRY
// =====================================

export async function createJournalEntry({

  tenantId,

  entryDate,

  description,

  sourceType,

  sourceId,

  createdBy,

  lines,

}) {

  // -----------------------------------
  // VALIDATION
  // -----------------------------------

  if (
    !Array.isArray(lines) ||
    lines.length === 0
  ) {

    throw new Error(
      "Journal entry lines required"
    );

  }

  // -----------------------------------
  // BALANCE VALIDATION
  // -----------------------------------

  const totalDebits =
    lines.reduce(
      (sum, line) =>
        sum +
        Number(
          line.debit || 0
        ),
      0
    );

  const totalCredits =
    lines.reduce(
      (sum, line) =>
        sum +
        Number(
          line.credit || 0
        ),
      0
    );

  const roundedDebits =
    Number(
      totalDebits.toFixed(2)
    );

  const roundedCredits =
    Number(
      totalCredits.toFixed(2)
    );

  if (
    roundedDebits !==
    roundedCredits
  ) {

    throw new Error(
      `Unbalanced journal entry:
       debits ${roundedDebits}
       !=
       credits ${roundedCredits}`
    );

  }

  // -----------------------------------
// PERMISSION VALIDATION
// -----------------------------------

await checkFinancePermission({

  userId:
    createdBy,

  permissionKey:
    "post_journal",

});
// -----------------------------------
// PERIOD VALIDATION
// -----------------------------------

await validateAccountingPeriod({

  tenantId,

  entryDate,

});
  // -----------------------------------
  // ENTRY NUMBER
  // -----------------------------------

  const entryNumber =
    `JE-${Date.now()}`;

  // -----------------------------------
  // CREATE HEADER
  // -----------------------------------

  const {
    data: journalEntry,
    error: entryError,
  } = await supabaseAdmin

    .from("journal_entries")

    .insert([{

      tenant_id:
        tenantId,

      entry_number:
        entryNumber,

      entry_date:
        entryDate,

      description,

      source_type:
        sourceType,

      source_id:
        sourceId,

      status:
        "posted",

      created_by:
        createdBy || "system",

    }])

    .select()

    .single();

  if (entryError) {

    throw entryError;

  }

  // -----------------------------------
  // CREATE LINES
  // -----------------------------------

  const preparedLines =
    lines.map((line) => ({

      tenant_id:
        tenantId,

      journal_entry_id:
        journalEntry.id,

      account_id:
        line.account_id,

      debit:
        Number(
          line.debit || 0
        ),

      credit:
        Number(
          line.credit || 0
        ),

      description:
        line.description || null,

    }));

  const {
    error: lineError,
  } = await supabaseAdmin

    .from("journal_entry_lines")

    .insert(
      preparedLines
    );

  if (lineError) {

    throw lineError;

  }

  // -----------------------------------
  // RESPONSE
  // -----------------------------------

  // -----------------------------------
  // EMIT GL EVENT
  // -----------------------------------

  await emitEvent(

    "JOURNAL_ENTRY_CREATED",

    {

      tenantId,

      journalEntryId:
        journalEntry.id,

      createdBy,

    }

  );


  return {

    success: true,

    journal_entry_id:
      journalEntry.id,

    entry_number:
      entryNumber,

    total_debits:
      roundedDebits,

    total_credits:
      roundedCredits,

  };

}