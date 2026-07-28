import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";
import { resolveFinanceAccountingPolicies } from "@/lib/finance/accounting-settings/resolveFinanceAccountingPolicy";
import { buildJournalFromEvent } from "./buildJournalFromEvent";

function firstValue(...values) {
  return values.find(
    value =>
      value !== undefined &&
      value !== null &&
      value !== ""
  );
}

function normalizeDate(value, field) {
  if (!value) return null;

  const candidate = new Date(value);

  if (Number.isNaN(candidate.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }

  return candidate.toISOString().slice(0, 10);
}

function resolvePostingDate({ basis, transactionDate, documentDate, eventDate }) {
  if (basis === "DOCUMENT_DATE") {
    return documentDate || transactionDate || eventDate;
  }

  if (basis === "EVENT_DATE") {
    return eventDate || transactionDate || documentDate;
  }

  return transactionDate || documentDate || eventDate;
}

function resolveReference({
  format,
  sourceModule,
  sourceDocumentId,
  eventIdentity,
}) {
  const sourceReference = `${sourceModule}:${sourceDocumentId || eventIdentity}`;
  const eventReference = `event:${eventIdentity}`;

  if (format === "EVENT_ID") return eventReference;
  if (format === "SOURCE_AND_EVENT") {
    return sourceDocumentId
      ? `${sourceReference}:${eventIdentity}`
      : eventReference;
  }

  return sourceReference;
}

export async function prepareAccountingEventJournal({ event } = {}) {
  if (!event?.organization_id) {
    throw new Error("Accounting event organization_id required");
  }

  if (!event?.entity_id) {
    throw new Error("Accounting event entity_id required");
  }

  if (!event?.event_type) {
    throw new Error("Accounting event type required");
  }

  const payload = event.payload || {};
  const transactionDate = normalizeDate(
    firstValue(
      payload.posting_date,
      payload.postingDate,
      payload.entry_date,
      payload.entryDate
    ),
    "Accounting event transaction date"
  );
  const documentDate = normalizeDate(
    firstValue(
      payload.document_date,
      payload.documentDate,
      payload.invoice_date,
      payload.invoiceDate,
      transactionDate
    ),
    "Accounting event document date"
  );
  const eventDate = normalizeDate(
    firstValue(
      event.occurred_at,
      event.created_at,
      transactionDate,
      documentDate
    ),
    "Accounting event date"
  );
  const policyEffectiveDate = transactionDate || documentDate || eventDate;

  if (!policyEffectiveDate) {
    throw new Error("Accounting event posting date required");
  }

  const policies = await resolveFinanceAccountingPolicies({
    organizationId: event.organization_id,
    effectiveDate: policyEffectiveDate,
  });
  const postingDate = resolvePostingDate({
    basis: policies.postingDateBasis.value,
    transactionDate,
    documentDate,
    eventDate,
  });

  if (!postingDate) {
    throw new Error("Accounting event posting date required");
  }

  const rule = await getPostingRule({
    organizationId: event.organization_id,
    entityId: event.entity_id,
    eventType: event.event_type,
    sourceModule: event.source_module,
    postingDate,
  });

  const lines = buildJournalFromEvent({
    event,
    rule,
  });
  const currencyCode = firstValue(
    payload.currency_code,
    payload.currencyCode,
    payload.currency
  );
  const exchangeRate = firstValue(
    payload.exchange_rate,
    payload.exchangeRate
  );
  const sourceDocumentId = firstValue(
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
    throw new Error("Accounting event identity required");
  }

  if (!currencyCode) {
    throw new Error("Accounting event currency required");
  }

  const numericExchangeRate = Number(exchangeRate);

  if (!Number.isFinite(numericExchangeRate) || numericExchangeRate <= 0) {
    throw new Error("Accounting event exchange rate must be positive");
  }

  return {
    organizationId: event.organization_id,
    entityId: event.entity_id,
    postingDate,
    documentDate: documentDate || postingDate,
    journalType: policies.systemJournalType.value,
    description: payload.description || event.event_type,
    reference: resolveReference({
      format: policies.journalReferenceFormat.value,
      sourceModule: event.source_module,
      sourceDocumentId,
      eventIdentity,
    }),
    sourceModule: event.source_module,
    sourceDocument: event.event_type,
    sourceDocumentId,
    currencyCode: String(currencyCode).trim().toUpperCase(),
    exchangeRate: numericExchangeRate,
    lines,
    idempotencyKey: `accounting-event:${eventIdentity}`,
    accountingPolicies: {
      postingDateBasis: policies.postingDateBasis.value,
      systemJournalType: policies.systemJournalType.value,
      journalReferenceFormat: policies.journalReferenceFormat.value,
    },
  };
}

export default prepareAccountingEventJournal;
