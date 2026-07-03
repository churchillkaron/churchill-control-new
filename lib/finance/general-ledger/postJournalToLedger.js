import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function postJournalToLedger({
  organizationId,
  journalEntryId,
  createdBy = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const { data: journal, error } = await supabaseAdmin
    .from("journal_entries")
    .select(`
      *,
      journal_entry_lines(*)
    `)
    .eq("id", journalEntryId)
    .eq("organization_id", organizationId)
    .single();

  if (error) throw error;

  const postingDate =
    journal.posting_date ||
    journal.entry_date ||
    new Date().toISOString().slice(0, 10);

  const period = String(postingDate).slice(0, 7);

  for (const line of journal.journal_entry_lines || []) {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    const balance = debit - credit;

    const { error: ledgerError } = await supabaseAdmin
      .from("general_ledger")
      .insert({
        organization_id: organizationId,
        legal_entity_id: journal.legal_entity_id,
        journal_entry_id: journal.id,
        journal_entry_line_id: line.id,
        account_id: line.account_id,
        department_id: line.department_id || null,
        cost_center_id: line.cost_center_id || null,
        debit,
        credit,
        balance,
        amount: Math.abs(balance),
        entry_type: debit >= credit ? "debit" : "credit",
        currency: journal.currency_code || "THB",
        currency_code: journal.currency_code || "THB",
        exchange_rate: journal.exchange_rate || 1,
        transaction_date: postingDate,
        posting_date: postingDate,
        posting_period: period,
        reference_type: journal.source_module || journal.source_type,
        reference_id: journal.source_document_id || journal.source_id,
        created_by: createdBy || journal.created_by,
      });

    if (ledgerError) throw ledgerError;
  }

  return {
    success: true,
    journalEntryId: journal.id,
    ledgerLines: journal.journal_entry_lines?.length || 0,
  };
}
