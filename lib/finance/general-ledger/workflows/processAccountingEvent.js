import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";
import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";
import { buildJournalFromEvent } from "./buildJournalFromEvent";

function firstValue(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );
}

export async function processAccountingEvent({
  event,
}) {
  const rule = await getPostingRule({
    organizationId:
      event.organization_id,

    entityId:
      event.entity_id,

    eventType:
      event.event_type,
  });

  const lines =
    buildJournalFromEvent({
      event,
      rule,
    });

  const payload =
    event.payload || {};

  const postingDate =
    firstValue(
      payload.posting_date,
      payload.postingDate,
      payload.entry_date,
      payload.entryDate,
      event.occurred_at?.slice?.(0, 10),
      event.created_at?.slice?.(0, 10)
    );

  const currencyCode =
    firstValue(
      payload.currency_code,
      payload.currencyCode,
      payload.currency
    );

  const exchangeRate =
    firstValue(
      payload.exchange_rate,
      payload.exchangeRate
    );

  const sourceDocumentId =
    firstValue(
      event.source_id,
      payload.source_document_id,
      payload.sourceDocumentId
    );

  const eventIdentity =
    event.id ||
    (
      sourceDocumentId
        ? [
            event.event_type,
            event.source_module,
            sourceDocumentId,
          ].join(":")
        : null
    );

  if (!eventIdentity) {
    throw new Error(
      "Accounting event identity required"
    );
  }

  return postJournalEntrySafe({
    organizationId:
      event.organization_id,

    entityId:
      event.entity_id,

    postingDate,

    documentDate:
      firstValue(
        payload.document_date,
        payload.documentDate,
        postingDate
      ),

    journalType:
      payload.journal_type ||
      "SYSTEM",

    description:
      payload.description ||
      event.event_type,

    reference:
      `${event.source_module}:${sourceDocumentId || eventIdentity}`,

    sourceModule:
      event.source_module,

    sourceDocument:
      event.event_type,

    sourceDocumentId,

    currencyCode,
    exchangeRate,
    lines,

    idempotencyKey:
      `accounting-event:${eventIdentity}`,
  });
}
