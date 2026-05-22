import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function createJournalReversal({

  journalEntryId,

  reversalReason = "Manual reversal",

  reversedBy = "SYSTEM",

}) {

  // =====================================
  // LOAD ORIGINAL ENTRY
  // =====================================

  const {
    data: originalEntry,
    error: entryError,
  } = await supabaseAdmin

    .from(
      "journal_entries"
    )

    .select("*")

    .eq(
      "id",
      journalEntryId
    )

    .single();

  if (entryError) {

    throw entryError;

  }

  // =====================================
  // PREVENT DOUBLE REVERSAL
  // =====================================

  if (
    originalEntry
      .reversed_journal_entry_id
  ) {

    throw new Error(
      "Journal already reversed"
    );

  }

  // =====================================
  // LOAD LINES
  // =====================================

  const {
    data: originalLines,
    error: linesError,
  } = await supabaseAdmin

    .from(
      "journal_entry_lines"
    )

    .select("*")

    .eq(
      "journal_entry_id",
      journalEntryId
    );

  if (linesError) {

    throw linesError;

  }

  // =====================================
  // CREATE REVERSAL ENTRY
  // =====================================

  const {
    data: reversalEntry,
    error: reversalError,
  } = await supabaseAdmin

    .from(
      "journal_entries"
    )

    .insert({

      tenant_id:
        originalEntry.tenant_id,

      journal_type:
        "REVERSAL",

      reference_type:
        originalEntry.reference_type,

      reference_id:
        originalEntry.reference_id,

      posting_date:
        new Date()
          .toISOString(),

      description:
        `REVERSAL: ${originalEntry.description}`,

      total_amount:
        originalEntry.total_amount,

      reversal_reason:
        reversalReason,

      reversal_created_at:
        new Date()
          .toISOString(),

    })

    .select()

    .single();

  if (reversalError) {

    throw reversalError;

  }

  // =====================================
  // REVERSE LINES
  // =====================================

  const reversedLines =
    originalLines.map(
      line => ({

        tenant_id:
          line.tenant_id,

        journal_entry_id:
          reversalEntry.id,

        account_code:
          line.account_code,

        debit:
          line.credit,

        credit:
          line.debit,

        description:
          `REVERSAL: ${line.description}`,

      })
    );

  const {
    error: reverseLinesError,
  } = await supabaseAdmin

    .from(
      "journal_entry_lines"
    )

    .insert(
      reversedLines
    );

  if (reverseLinesError) {

    throw reverseLinesError;

  }

  // =====================================
  // LINK ORIGINAL
  // =====================================

  await supabaseAdmin

    .from(
      "journal_entries"
    )

    .update({

      reversed_journal_entry_id:
        reversalEntry.id,

    })

    .eq(
      "id",
      journalEntryId
    );

  return {

    success: true,

    reversalEntryId:
      reversalEntry.id,

  };

}
