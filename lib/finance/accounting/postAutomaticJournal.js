import { createServerSupabase } from "@/lib/shared/supabase/server";
import { createJournalEntry } from "@/lib/finance/accounting/createJournalEntry";
import { findAccount } from "@/lib/finance/accounting/findAccount";

export async function postAutomaticJournal({
  tenantId,
  organizationId,
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

  if (!organizationId) {
    throw new Error("organizationId required for automatic journal");
  }

  const journal = await createJournalEntry({
    tenantId,
    organizationId,
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
