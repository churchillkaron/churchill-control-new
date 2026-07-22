import { validateJournalIntegrity } from "../guards/validateJournalIntegrity.js";
import { validatePostingPeriod } from "../guards/validatePostingPeriod.js";
import { validateAccountingPeriod } from "../workflows/validateAccountingPeriod";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function postJournalEntrySafe({
  organizationId,
  entityId,
  postingDate,
  documentDate,
  journalType = "GENERAL",
  reference,
  sourceModule = "finance",
  sourceDocument = null,
  sourceDocumentId = null,
  description,
  currencyCode,
  exchangeRate,
  lines = [],
  createdBy = null,
  idempotencyKey = null,
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!entityId) {
    throw new Error("entityId required");
  }

  if (!postingDate) {
    throw new Error("postingDate required");
  }

  const resolvedCurrency =
    String(currencyCode || "")
      .trim()
      .toUpperCase();

  if (!resolvedCurrency) {
    throw new Error("currencyCode required");
  }

  const resolvedExchangeRate =
    Number(exchangeRate);

  if (
    !Number.isFinite(resolvedExchangeRate) ||
    resolvedExchangeRate <= 0
  ) {
    throw new Error(
      "exchangeRate must be positive"
    );
  }

  validateJournalIntegrity(lines);
  validatePostingPeriod(postingDate);

  await validateAccountingPeriod({
    organizationId,
    entityId,
    postingDate,
  });

  const resolvedIdempotencyKey =
    idempotencyKey ||
    (
      sourceDocumentId
        ? [
            sourceModule,
            sourceDocument || "document",
            sourceDocumentId,
          ].join(":")
        : null
    );

  const { data, error } =
    await supabaseAdmin.rpc(
      "finance_post_journal_atomic",
      {
        p_organization_id:
          organizationId,

        p_entity_id:
          entityId,

        p_posting_date:
          postingDate,

        p_document_date:
          documentDate || postingDate,

        p_journal_type:
          journalType,

        p_reference:
          reference || null,

        p_source_module:
          sourceModule || null,

        p_source_document:
          sourceDocument || null,

        p_source_document_id:
          sourceDocumentId || null,

        p_description:
          description || null,

        p_currency_code:
          resolvedCurrency,

        p_exchange_rate:
          resolvedExchangeRate,

        p_lines:
          lines,

        p_created_by:
          createdBy || null,

        p_idempotency_key:
          resolvedIdempotencyKey,
      }
    );

  if (error) {
    throw new Error(
      `Atomic journal posting failed: ${
        error.message
      }`
    );
  }

  return data;
}
