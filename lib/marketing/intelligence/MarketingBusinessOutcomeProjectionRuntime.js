import { MarketingOutcomeAttributionRuntime } from "@/lib/marketing/intelligence/MarketingOutcomeAttributionRuntime";
import { MarketingAttributionTrackingRuntime } from "@/lib/marketing/intelligence/MarketingAttributionTrackingRuntime";

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

function externalTracking(payload = {}) {
  const candidates = [
    object(payload.tracking),
    object(payload.marketing_attribution),
    object(payload.attribution),
    object(payload.metadata?.marketing_attribution),
    object(payload.metadata?.tracking),
  ];

  return candidates.find((candidate) =>
    Boolean(candidate.avq_sig || candidate.signature || candidate.sig),
  ) || null;
}

function explicitCampaignContext(payload = {}) {
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
    verifiedExternal: false,
    inherited: false,
  };
}

function campaignContext(payload = {}) {
  const tracking = externalTracking(payload);
  if (!tracking) return explicitCampaignContext(payload);

  const verified = MarketingAttributionTrackingRuntime.verify(tracking);
  if (!verified.valid) {
    return {
      marketingCampaignId: null,
      managedMediaCampaignId: null,
      providerId: null,
      providerCampaignId: null,
      verifiedExternal: false,
      inherited: false,
      invalidExternalReason: verified.reason,
    };
  }

  return {
    marketingCampaignId: verified.context.marketingCampaignId,
    managedMediaCampaignId: verified.context.managedMediaCampaignId,
    providerId: verified.context.providerId || "internal",
    providerCampaignId: verified.context.providerCampaignId,
    verifiedExternal: true,
    inherited: false,
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

function lineageReference(payload = {}) {
  const metadata = object(payload.metadata);
  const parent = object(
    payload.attribution_parent ||
      payload.attributionParent ||
      metadata.attribution_parent ||
      metadata.attributionParent,
  );

  return {
    sourceDocumentType:
      text(
        parent.sourceDocumentType ||
          parent.source_document_type ||
          payload.parentSourceDocumentType ||
          payload.parent_source_document_type,
      ) || null,
    sourceDocumentId:
      text(
        parent.sourceDocumentId ||
          parent.source_document_id ||
          payload.parentSourceDocumentId ||
          payload.parent_source_document_id,
      ) || null,
    leadId: text(parent.leadId || parent.lead_id || payload.leadId || payload.lead_id) || null,
    reservationId:
      text(
        parent.reservationId ||
          parent.reservation_id ||
          payload.reservationId ||
          payload.reservation_id,
      ) || null,
    orderId: text(parent.orderId || parent.order_id || payload.orderId || payload.order_id) || null,
    invoiceId:
      text(parent.invoiceId || parent.invoice_id || payload.invoiceId || payload.invoice_id) || null,
  };
}

async function resolveCampaignContext(payload, organizationId) {
  const direct = campaignContext(payload);
  if (direct.invalidExternalReason || direct.marketingCampaignId) return direct;

  const reference = lineageReference(payload);
  const hasReference = Object.values(reference).some(Boolean);
  if (!hasReference) return direct;

  const lineage = await MarketingOutcomeAttributionRuntime.resolveLineage({
    organizationId,
    ...reference,
  });

  if (!lineage) return direct;

  return {
    marketingCampaignId: lineage.marketing_campaign_id,
    managedMediaCampaignId: lineage.managed_media_campaign_id,
    providerId: lineage.provider_id || "internal",
    providerCampaignId: lineage.provider_campaign_id || null,
    verifiedExternal: false,
    inherited: true,
    inheritedFromAttributionId: lineage.id,
    inheritedAttributionModel: lineage.attribution_model || "DIRECT",
    inheritedConfidence: number(lineage.confidence, 1),
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

    const campaign = await resolveCampaignContext(payload, organizationId);
    if (!campaign.marketingCampaignId) {
      return {
        projected: false,
        reason:
          campaign.invalidExternalReason ||
          "NO_MARKETING_CAMPAIGN_ATTRIBUTION_CONTEXT",
      };
    }

    if (campaign.verifiedExternal) {
      const trackingOrganization = text(
        externalTracking(payload)?.avq_oid ||
          externalTracking(payload)?.organization_id ||
          externalTracking(payload)?.organizationId,
      );
      if (trackingOrganization !== organizationId) {
        return {
          projected: false,
          reason: "ATTRIBUTION_ORGANIZATION_MISMATCH",
        };
      }
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

    const confidence = campaign.inherited
      ? Math.min(number(payload.confidence, 1), number(campaign.inheritedConfidence, 1))
      : number(payload.confidence, 1);
    const attributionModel = campaign.inherited
      ? upper(payload.attributionModel || payload.attribution_model || "INHERITED_DIRECT")
      : upper(payload.attributionModel || payload.attribution_model || "DIRECT");

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
      attributionModel,
      confidence,
      idempotencyKey,
      occurredAt: payload.occurredAt || payload.occurred_at || null,
      metadata: {
        ...object(payload.metadata),
        projection_source: "BUSINESS_OUTCOME",
        business_event_type: text(payload.event_type || payload.eventType) || null,
        signed_external_attribution: campaign.verifiedExternal,
        inherited_attribution: campaign.inherited,
        inherited_from_attribution_id: campaign.inheritedFromAttributionId || null,
      },
    });

    return {
      projected: true,
      attribution_id: record.id,
      marketing_campaign_id: record.marketing_campaign_id,
      outcome_type: record.outcome_type,
      inherited_attribution: campaign.inherited,
    };
  },
};
