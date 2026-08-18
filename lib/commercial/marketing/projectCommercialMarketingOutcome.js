import { MarketingAttributionCaptureRuntime } from "@/lib/marketing/intelligence/MarketingAttributionCaptureRuntime";
import { MarketingBusinessOutcomeProjectionRuntime } from "@/lib/marketing/intelligence/MarketingBusinessOutcomeProjectionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function documentId(result = {}, body = {}, type = "DOCUMENT") {
  const upperType = text(type).toUpperCase();
  if (upperType === "QUOTATION") {
    return text(
      result.quotation?.id ||
        result.quotation_id ||
        result.id ||
        body.quotationId ||
        body.quotation_id,
    );
  }
  if (upperType === "SALES_ORDER") {
    return text(
      result.order?.id ||
        result.sales_order_id ||
        result.order_id ||
        result.id ||
        body.salesOrderId ||
        body.sales_order_id ||
        body.orderId ||
        body.order_id,
    );
  }
  return text(result.id || body.id);
}

function parentReference(body = {}) {
  const explicit = object(body.attribution_parent || body.attributionParent);
  if (Object.keys(explicit).length) return explicit;

  const sourceReference = text(body.sourceReference || body.source_reference);
  const sourceType = text(body.sourceType || body.source_type).toUpperCase();
  if (!sourceReference) return null;

  return {
    source_document_type:
      sourceType.includes("QUOT") ? "QUOTATION" : sourceType || "SOURCE_DOCUMENT",
    source_document_id: sourceReference,
  };
}

function invoiceId(result = {}, body = {}) {
  return (
    text(
      result.invoice?.id ||
        result.invoice_id ||
        result.customer_invoice_id ||
        body.invoiceId ||
        body.invoice_id ||
        body.customerInvoiceId ||
        body.customer_invoice_id,
    ) || null
  );
}

export async function projectCommercialMarketingOutcome({
  organizationId,
  body = {},
  result = {},
  documentType,
  outcomeType,
  qualified = false,
  revenue = 0,
  metadata = {},
}) {
  const sourceDocumentId = documentId(result, body, documentType);
  if (!sourceDocumentId) {
    return { projected: false, reason: "COMMERCIAL_DOCUMENT_ID_UNAVAILABLE" };
  }

  const tracking = MarketingAttributionCaptureRuntime.fromObject(body);
  const parent = parentReference(body);
  const resolvedInvoiceId = invoiceId(result, body);

  try {
    return await MarketingBusinessOutcomeProjectionRuntime.project({
      organizationId,
      marketing_attribution: tracking || undefined,
      attribution_parent: parent || undefined,
      outcomeType,
      qualified,
      quantity: 1,
      revenue: number(revenue, 0),
      currency:
        result.quotation?.currency_code ||
        result.order?.currency_code ||
        result.currency_code ||
        body.currencyCode ||
        body.currency_code ||
        body.currency ||
        "THB",
      partyId:
        result.quotation?.party_id ||
        result.order?.party_id ||
        result.party_id ||
        body.partyId ||
        body.party_id ||
        null,
      sourceDocumentType: documentType,
      sourceDocumentId,
      orderId:
        text(documentType).toUpperCase() === "SALES_ORDER"
          ? sourceDocumentId
          : body.orderId || body.order_id || null,
      invoiceId: resolvedInvoiceId,
      metadata: {
        ...object(metadata),
        commercial_projection: true,
        ...(resolvedInvoiceId ? { generated_invoice_id: resolvedInvoiceId } : {}),
      },
    });
  } catch (error) {
    console.error("COMMERCIAL_MARKETING_OUTCOME_PROJECTION_FAILED", {
      documentType,
      sourceDocumentId,
      message: error?.message || String(error),
    });
    return {
      projected: false,
      reason: "MARKETING_OUTCOME_PROJECTION_FAILED",
      error: error?.message || String(error),
    };
  }
}

export default projectCommercialMarketingOutcome;
