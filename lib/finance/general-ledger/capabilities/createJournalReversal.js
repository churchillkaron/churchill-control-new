import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";

export default async function createJournalReversal({
  organizationId,
  journalEntryId,
  reversalReason = "Manual reversal",
  reversedBy = "SYSTEM",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!journalEntryId) {
    throw new Error("journalEntryId required");
  }

  const { data: originalEntry, error: entryError } =
    await supabaseAdmin
      .from("journal_entries")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", journalEntryId)
      .single();

  if (entryError || !originalEntry) {
    throw new Error("Journal not found");
  }

  if (
    originalEntry.reversed === true ||
    originalEntry.reversal_journal_id ||
    originalEntry.reversed_journal_entry_id
  ) {
    throw new Error("Journal already reversed");
  }

  const entityId =
    originalEntry.entity_id ||
    originalEntry.entityId;

  if (!entityId) {
    throw new Error("entity_id missing on original journal");
  }

  const { data: originalLines, error: linesError } =
    await supabaseAdmin
      .from("journal_entry_lines")
      .select("*")
      .eq("journal_entry_id", journalEntryId);

  if (linesError) {
    throw linesError;
  }

  if (!originalEntry.currency_code) {
    throw new Error(
      "currency_code missing on original journal"
    );
  }

  const reversal =
    await postJournalEntrySafe({
      organizationId,
      entityId,
      postingDate:
        new Date().toISOString().slice(0, 10),
      documentDate:
        new Date().toISOString().slice(0, 10),
      journalType: "REVERSAL",
      reference:
        `REVERSAL:${journalEntryId}`,
      sourceModule: "finance",
      sourceDocument: "journal_reversal",
      sourceDocumentId: journalEntryId,
      description:
        `Reversal of ${originalEntry.journal_number || originalEntry.entry_number || journalEntryId} - ${reversalReason}`,
      currencyCode:
        originalEntry.currency_code,
      exchangeRate:
        originalEntry.exchange_rate || 1,
      createdBy:
        reversedBy,
      idempotencyKey:
        `journal-reversal:${journalEntryId}`,
      lines:
        (originalLines || []).map((line) => ({
          account_id:
            line.account_id,
          department_id:
            line.department_id || null,
          cost_center_id:
            line.cost_center_id || null,
          description:
            `REVERSAL: ${line.description || ""}`,
          debit:
            Number(line.credit || 0),
          credit:
            Number(line.debit || 0),
        })),
    });

  await supabaseAdmin
    .from("journal_entries")
    .update({
      reversed: true,
      reversed_at: new Date().toISOString(),
      reversal_journal_id: reversal.journal.id,
      reversed_journal_entry_id: reversal.journal.id,
      reversal_status: "completed",
    })
    .eq("organization_id", organizationId)
    .eq("id", journalEntryId);

  await supabaseAdmin
    .from("audit_logs")
    .insert([{
      organization_id: organizationId,
      action: "JOURNAL_REVERSED",
      entity_type: "journal_entry",
      entity_id: journalEntryId,
      metadata: {
        reversalJournalId: reversal.journal.id,
        reason: reversalReason,
        reversedBy,
      },
    }]);

  return {
    success: true,
    reversalJournal: reversal.journal,
    reversalLines: reversal.entries,
    ledger: reversal.ledger,
  };
}
