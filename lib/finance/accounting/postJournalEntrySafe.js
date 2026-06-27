import { validateAccountingPeriod } from "./validateAccountingPeriod";
import { getNextJENumber } from "./utils/getNextJENumber";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function postJournalEntrySafe({
  organizationId,
  entityId,
  legalEntityId,
  postingDate,
  documentDate,
  journalType,
  reference,
  sourceModule,
  sourceDocument,
  sourceDocumentId,
  description,
  currencyCode = "THB",
  exchangeRate = 1,
  lines = [],
  createdBy,
}) {
  await validateAccountingPeriod({
    organizationId,
    entityId,
    postingDate,
  });

  const journalNumber =
    await getNextJENumber({
      organizationId,
      entityId,
    });

  const { data: journal, error } =
    await supabaseAdmin
      .from("journal_entries")
      .insert({
        organization_id: organizationId,
        entity_id: entityId,
        legal_entity_id: legalEntityId,
        journal_number: journalNumber,
        journal_type: journalType,
        posting_date: postingDate,
        document_date: documentDate,
        reference,
        source_module: sourceModule,
        source_document: sourceDocument,
        source_document_id: sourceDocumentId,
        description,
        currency_code: currencyCode,
        exchange_rate: exchangeRate,
        status: "POSTED",
        created_by: createdBy,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const { error: lineError } =
      await supabaseAdmin
        .from("journal_entry_lines")
        .insert({
          organization_id: organizationId,
          entity_id: entityId,
          journal_entry_id: journal.id,
          line_number: i + 1,
          account_id: line.account_id,
          department_id:
            line.department_id || null,
          cost_center_id:
            line.cost_center_id || null,
          description:
            line.description || null,
          currency_code: currencyCode,
          exchange_rate: exchangeRate,
          debit:
            Number(line.debit || 0),
          credit:
            Number(line.credit || 0),
        });

    if (lineError) {
      throw lineError;
    }
  }

  return journal;
}
