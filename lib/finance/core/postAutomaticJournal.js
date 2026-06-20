import { createServerSupabase } from "@/lib/shared/supabase/server";
import { createJournalEntry } from "@/lib/finance/accounting/createJournalEntry";
import { findAccount } from "@/lib/finance/accounting/findAccount";

export async function postAutomaticJournal({
  tenantId,
  journalDate,
  referenceType,
  referenceId,
  debitAccount,
  creditAccount,
  amount,
  description,
  createdBy = "system",
}) {
  const debit = await findAccount({
    tenantId,
    code: debitAccount,
  });

  const credit = await findAccount({
    tenantId,
    code: creditAccount,
  });

  const journal = await createJournalEntry({
    tenantId,
    entryDate: journalDate,
    description,
    sourceType: referenceType,
    sourceId: referenceId,
    createdBy,
    lines: [
      {
        account_id: debit.id,
        debit: Number(amount || 0),
        credit: 0,
        description,
      },
      {
        account_id: credit.id,
        debit: 0,
        credit: Number(amount || 0),
        description,
      },
    ],
  });

  return {
    success: true,
    journal,
    ledger: journal.ledger || null,
  };
}
