import { validateJournalIntegrity } from "../guards/validateJournalIntegrity.js";
import { validatePostingPeriod } from "../guards/validatePostingPeriod.js";
import { validateAccountingPeriod } from "../workflows/validateAccountingPeriod";
import { getNextJENumber } from "../repositories/getNextJENumber";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { postJournalToLedger } from "@/lib/finance/general-ledger/postJournalToLedger";

export async function postJournalEntrySafe({
  organizationId,
  entityId,
  legalEntityId,
  postingDate,
  documentDate,
  journalType = "GENERAL",
  reference,
  sourceModule = "finance",
  sourceDocument = null,
  sourceDocumentId = null,
  description,
  currencyCode = "THB",
  exchangeRate = 1,
  lines = [],
  createdBy = null,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const resolvedEntityId = legalEntityId || entityId;

  if (!resolvedEntityId) {
    throw new Error("legalEntityId required");
  }

  validateJournalIntegrity(lines);
  validatePostingPeriod(postingDate);

  await validateAccountingPeriod({
    organizationId,
    entityId: resolvedEntityId,
    postingDate,
  });

  const entryNumber = await getNextJENumber({
    organizationId,
    entityId: resolvedEntityId,
  });

  const { data: journal, error } = await supabaseAdmin
    .from("journal_entries")
    .insert({
      organization_id: organizationId,
      legal_entity_id: resolvedEntityId,
      entry_number: entryNumber,
      entry_date: postingDate,
      posting_date: postingDate,
      document_date: documentDate || postingDate,
      journal_type: journalType,
      reference,
      source_type: sourceModule,
      source_module: sourceModule,
      source_document: sourceDocument,
      source_id: sourceDocumentId,
      source_document_id: sourceDocumentId,
      description,
      currency_code: currencyCode,
      exchange_rate: exchangeRate,
      status: "POSTED",
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) throw error;

  const entries = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const { data: entry, error: lineError } = await supabaseAdmin
      .from("journal_entry_lines")
      .insert({
        organization_id: organizationId,
        legal_entity_id: resolvedEntityId,
        journal_entry_id: journal.id,
        line_number: i + 1,
        account_id: line.account_id,
        department_id: line.department_id || null,
        cost_center_id: line.cost_center_id || null,
        description: line.description || null,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        created_by: createdBy,
      })
      .select()
      .single();

    if (lineError) throw lineError;

    entries.push(entry);
  }

  const ledger = await postJournalToLedger({
    organizationId,
    journalEntryId: journal.id,
    createdBy,
  });

  return {
    journal,
    entries,
    ledger,
  };
}
