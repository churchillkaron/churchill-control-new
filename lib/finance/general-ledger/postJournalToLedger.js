import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function postJournalToLedger({
  organizationId,
  entityId,
  journalEntryId,
  createdBy = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  const { data: journal, error } =
    await supabaseAdmin
      .from("journal_entries")
      .select(`
        *,
        journal_entry_lines(*)
      `)
      .eq("id", journalEntryId)
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .single();

  if (error) {
    throw error;
  }

  const period =
    String(journal.posting_date).slice(0, 7);

  for (const line of journal.journal_entry_lines) {

    const balance =
      Number(line.debit || 0) -
      Number(line.credit || 0);

    const { error: ledgerError } =
      await supabaseAdmin
        .from("general_ledger")
        .insert({
          organization_id: organizationId,
          entity_id: entityId,

          legal_entity_id:
            journal.legal_entity_id,

          journal_entry_id:
            journal.id,

          journal_entry_line_id:
            line.id,

          account_id:
            line.account_id,

          posting_date:
            journal.posting_date,

          posting_period:
            period,

          currency_code:
            line.currency_code ||
            journal.currency_code,

          exchange_rate:
            line.exchange_rate ||
            journal.exchange_rate ||
            1,

          debit:
            Number(line.debit || 0),

          credit:
            Number(line.credit || 0),

          balance,

          department_id:
            line.department_id,

          cost_center_id:
            line.cost_center_id,

          reference_type:
            journal.source_module,

          reference_id:
            journal.source_document_id,

          created_by:
            createdBy ||
            journal.created_by,
        });

    if (ledgerError) {
      throw ledgerError;
    }
  }

  return {
    success: true,
    journalEntryId:
      journal.id,
    ledgerLines:
      journal.journal_entry_lines.length,
  };
}
