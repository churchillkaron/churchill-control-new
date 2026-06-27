import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createJournalReversal
from "@/lib/finance/general-ledger/capabilities/createJournalReversal";

import isPayrollImmutable
from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function reversePayrollJournal({

  payrollRecordId,

  type = "ACCRUAL",

  reason = "Payroll correction",

}) {

  const {
    data: record,
    error,
  } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .single();

  if (error) {
    throw error;
  }

  if (
    isPayrollImmutable(
      record.status
    )
  ) {

    throw new Error(
      "Archived payroll cannot be reversed"
    );

  }

  const journalEntryId =
    type === "SETTLEMENT"
      ? record.settlement_journal_entry_id
      : record.accrual_journal_entry_id;

  if (!journalEntryId) {
    throw new Error("No payroll journal found");
  }

  return createJournalReversal({
    journalEntryId,
    reversalReason: reason,
    reversedBy: "PAYROLL_ADMIN",
  });

}
