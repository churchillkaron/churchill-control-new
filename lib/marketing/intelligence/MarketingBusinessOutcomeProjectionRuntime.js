import { MarketingOutcomeAttributionRuntime } from "@/lib/marketing/intelligence/MarketingOutcomeAttributionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function campaignContext(payload = {}) {
  const metadata = object(payload.metadata);
  const attribution = object(payload.attribution);
  return {
    marketingCampaignId:
      text(
        payload.marketingCampaignId ||
          payload.marketing_campaign_id ||
          attribution.marketing_campaign_id ||
          metadata.marketing_campaign_id,
      ) || null,
    managedMediaCampaignId:
      text(
        payload.managedMediaCampaignId ||
          payload.managed_media_campaign_id ||
          attribution.managed_media_campaign_id ||
          metadata.managed_media_campaign_id,
      ) || null,
    providerId:
      text(
        payload.providerId ||
          payload.provider_id ||
          attribution.provider_id ||
          metadata.provider_id,
      ) || "internal",
    providerCampaignId:
      text(
        payload.providerCampaignId ||
          payload.provider_campaign_id ||
          attribution.provider_campaign_id ||
          metadata.provider_campaign_id,
      ) || null,
  };
}

function sourceDocument(payload = {}) {
  return {
    sourceDocumentType:
      text(payload.sourceDocumentType || payload.source_document_type || payload.document_type) || null,
    sourceDocumentId:
      text(payload.sourceDocumentId || payload.source_document_id || payload.document_id || payload.id) || null,
  };
}

function outcomeDefaults(type) {
  const outcomeType = upper(type || "CONVERSION");
  return {
    outcomeType,
    qualified: [
      "QUALIFIED_LEAD",
      "BOOKING",
      "RESERVATION",
      "SALE",
      "PURCHASE",
      "PAYMENT",
      "DEPOSIT",
      "CONTRACT",
      "SIGNED_CONTRACT",
    ].includes(outcomeType),
  };
}

export const MarketingBusinessOutcomeProjectionRuntime = {
  async project(payload = {}) {
    const organizationId = text(payload.organizationId || payload.organization_id);
    if (!organizationId) throw new Error("organizationId required");

    const campaign = campaignContext(payload);
    if (!campaign.marketingCampaignId) {
      return {
        projected: false,
        reason: "NO_MARKETING_CAMPAIGN_ATTRIBUTION_CONTEXT",
      };
    }

    const defaults = outcomeDefaults(payload.outcomeType || payload.outcome_type || payload.event_type);
    const source = sourceDocument(payload);
    const idempotencyKey = text(
      payload.idempotencyKey ||
        payload.idempotency_key ||
        [
          "marketing-outcome",
          organizationId,
          campaign.marketingCampaignId,
          defaults.outcomeType,
          source.sourceDocumentType || "document",
          source.sourceDocumentId || payload.event_id || payload.eventId,
        ]
          .filter(Boolean)
          .join(":"),
    );

    if (!source.sourceDocumentId && !text(payload.event_id || payload.eventId)) {
      throw new Error("A source document id or event id is required for deterministic attribution");
    }

    const record = await MarketingOutcomeAttributionRuntime.record({
      organizationId,
      marketingCampaignId: campaign.marketingCampaignId,
      managedMediaCampaignId: campaign.managedMediaCampaignId,
      providerId: campaign.providerId,
      providerCampaignId: campaign.providerCampaignId,
      outcomeType: defaults.outcomeType,
      qualified: payload.qualified === undefined ? defaults.qualified : Boolean(payload.qualified),
      quantity: Math.max(0, number(payload.quantity, 1)),
      revenue: number(payload.revenue ?? payload.value ?? payload.amount, 0),
      cost: number(payload.cost, 0),
      profit: number(payload.profit ?? payload.gross_profit, 0),
      currency: upper(payload.currency || payload.currency_code || "THB"),
      partyId: payload.partyId || payload.party_id || null,
      customerId: payload.customerId || payload.customer_id || null,
      leadId: payload.leadId || payload.lead_id || null,
      reservationId: payload.reservationId || payload.reservation_id || null,
      orderId: payload.orderId || payload.order_id || null,
      invoiceId: payload.invoiceId || payload.invoice_id || null,
      sourceDocumentType: source.sourceDocumentType,
      sourceDocumentId: source.sourceDocumentId,
      attributionModel: upper(payload.attributionModel || payload.attribution_model || "DIRECT"),
      confidence: number(payload.confidence, 1),
      idempotencyKey,
      occurredAt: payload.occurredAt || payload.occurred_at || null,
      metadata: {
        ...object(payload.metadata),
        projection_source: "BUSINESS_OUTCOME",
        business_event_type: text(payload.event_type || payload.eventType) || null,
      },
    });

    return {
      projected: true,
      attribution_id: record.id,
      marketing_campaign_id: record.marketing_campaign_id,
      outcome_type: record.outcome_type,
    };
  },
};
