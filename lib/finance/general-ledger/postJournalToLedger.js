import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function postJournalToLedger({
  tenantId,
  organizationId,
  journalEntryId,
  createdBy = "system",
}) {
  if (!tenantId) {
    throw new Error("tenantId required");
  }

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { data: existingLedgerRows } =
    await supabaseAdmin
      .from("general_ledger")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("journal_entry_id", journalEntryId)
      .limit(1);

  if ((existingLedgerRows || []).length > 0) {
    return {
      success: true,
      skipped: true,
      reason: "LEDGER_ALREADY_POSTED",
      journalEntryId,
    };
  }

  const { data: journal, error: journalError } =
    await supabaseAdmin
      .from("journal_entries")
      .select(`
        *,
        journal_entry_lines (*)
      `)
      .eq("id", journalEntryId)
      .eq("organization_id", organizationId)
      .single();

  if (journalError || !journal) {
    return {
      success: false,
      error: "JOURNAL_NOT_FOUND",
    };
  }

  for (const line of journal.journal_entry_lines || []) {
    const { data: account, error: accountError } =
      await supabaseAdmin
        .from("chart_of_accounts")
        .select("*")
        .eq("id", line.account_id)
        .eq("organization_id", organizationId)
        .single();

    if (accountError || !account) {
      return {
        success: false,
        error: "ACCOUNT_NOT_FOUND",
      };
    }

    const debit =
      Number(line.debit || 0);

    const credit =
      Number(line.credit || 0);

    const entryType =
      debit > 0
        ? "DEBIT"
        : "CREDIT";

    const amount =
      debit > 0
        ? debit
        : credit;

    const { error: ledgerError } =
      await supabaseAdmin
        .from("general_ledger")
        .insert({
          organization_id: organizationId,
          tenant_id: tenantId,
          journal_entry_id: journal.id,
          journal_entry_line_id: line.id,
          account_id: line.account_id,
          account_name: account.name || "Unknown",
          entry_type: entryType,
          amount,
          debit,
          credit,
          currency: "THB",
          exchange_rate: 1,
          transaction_date: journal.entry_date,
          posting_period:
            journal.entry_date?.slice(0, 7),
          legal_entity_id:
            journal.legal_entity_id || null,
          department_id: null,
          cost_center_id:
            line.cost_center_id || null,
          reference_type:
            journal.source_type,
          reference_id:
            journal.source_id,
          created_by:
            createdBy ||
            journal.created_by ||
            "system",
          approved_by:
            journal.approved_by ||
            createdBy ||
            "system",
          approved_at:
            journal.approved_at ||
            new Date().toISOString(),
          created_at:
            new Date().toISOString(),
        });

    if (ledgerError) {
      return {
        success: false,
        error: ledgerError.message,
      };
    }
  }

  await supabaseAdmin
    .from("journal_entries")
    .update({
      status: "POSTED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", journal.id)
    .eq("organization_id", organizationId);

  return {
    success: true,
    journal_entry_id: journal.id,
    ledger_lines:
      journal.journal_entry_lines.length,
  };
}
