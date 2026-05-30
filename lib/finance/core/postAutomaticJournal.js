import { supabase } from "@/lib/supabase";

export async function postAutomaticJournal({
  tenantId,
  journalDate,
  referenceType,
  referenceId,
  debitAccount,
  creditAccount,
  amount,
  description,
}) {
  const entries = [
    {
      tenant_id: tenantId,
      journal_date: journalDate,
      reference_type: referenceType,
      reference_id: referenceId,
      account_code: debitAccount,
      entry_type: "DEBIT",
      amount,
      description,
    },
    {
      tenant_id: tenantId,
      journal_date: journalDate,
      reference_type: referenceType,
      reference_id: referenceId,
      account_code: creditAccount,
      entry_type: "CREDIT",
      amount,
      description,
    },
  ];

  const { data, error } =
    await supabase
      .from(
        "accounting_journal_entries"
      )
      .insert(entries)
      .select();

  if (error) {
    throw error;
  }

  return data;
}
