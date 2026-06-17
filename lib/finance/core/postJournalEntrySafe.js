import { createServerSupabase } from "@/lib/shared/supabase/server";
import { createJournalEntry } from "@/lib/finance/accounting/createJournalEntry";
import postJournalToLedger from "@/lib/finance/general-ledger/postJournalToLedger";
import { writeImmutableAudit } from "./writeImmutableAudit";

export async function postJournalEntrySafe({
  organizationId = null,
  tenantId,
  legalEntityId = null,
  entryDate,
  description,
  reference,
  lines,
  createdBy = "system",
  approvedBy = null,
}) {
  if (!entryDate) {
    throw new Error("Missing entry date");
  }

  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("Journal requires minimum two lines");
  }

  const normalizedLines = lines.map((line) => ({
    account_id: line.account_id || line.accountId,
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    description: line.description || line.memo || null,
  }));

  const journal = await createJournalEntry({
    organizationId,
    tenantId,
    legalEntityId,
    entryDate,
    description,
    sourceType: "SAFE_JOURNAL",
    sourceId: reference,
    createdBy,
    approvedBy,
    status: "posted",
    lines: normalizedLines,
  });

  const ledger = await postJournalToLedger({
    tenantId,
    journalEntryId: journal.journal_entry_id,
    createdBy,
  });

  if (!ledger.success) {
    throw new Error(
      ledger.error || "Ledger posting failed"
    );
  }

  await writeImmutableAudit({
    tenant_id: tenantId,
    entity_type: "journal_entry",
    entity_id: journal.journal_entry_id,
    action_type: "created",
    action_data: {
      description,
      reference,
      posting_source: "system_safe_posting",
      lines: normalizedLines,
      ledger,
    },
  });

  return {
    journal,
    ledger,
    lines: normalizedLines,
  };
}
