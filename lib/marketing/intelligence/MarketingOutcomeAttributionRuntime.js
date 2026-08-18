import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function requireCampaign(organizationId, campaignId) {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id,organization_id,campaign_name")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Marketing campaign not found for organization");
  return data;
}

async function requireManagedMediaCampaign(organizationId, managedMediaCampaignId) {
  if (!managedMediaCampaignId) return null;

  const { data, error } = await supabaseAdmin
    .from("managed_media_campaigns")
    .select("id,organization_id,provider,provider_campaign_id,currency")
    .eq("id", managedMediaCampaignId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Managed media campaign not found for organization");
  return data;
}

async function latestLineageMatch(query) {
  const { data, error } = await query
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export const MarketingOutcomeAttributionRuntime = {
  async record({
    organizationId,
    marketingCampaignId,
    managedMediaCampaignId = null,
    providerId = "internal",
    providerCampaignId = null,
    outcomeType,
    qualified = false,
    quantity = 1,
    revenue = 0,
    cost = 0,
    profit = 0,
    currency = "THB",
    partyId = null,
    customerId = null,
    leadId = null,
    reservationId = null,
    orderId = null,
    invoiceId = null,
    sourceDocumentType = null,
    sourceDocumentId = null,
    attributionModel = "DIRECT",
    confidence = 1,
    idempotencyKey,
    metadata = {},
    occurredAt = null,
  }) {
    const resolvedOrganizationId = text(organizationId);
    const resolvedCampaignId = text(marketingCampaignId);
    const resolvedOutcomeType = upper(outcomeType || "CONVERSION");
    const resolvedIdempotencyKey = text(idempotencyKey);

    if (!resolvedOrganizationId) throw new Error("organizationId required");
    if (!resolvedCampaignId) throw new Error("marketingCampaignId required");
    if (!resolvedIdempotencyKey) throw new Error("idempotencyKey required");

    const campaign = await requireCampaign(resolvedOrganizationId, resolvedCampaignId);
    const managed = await requireManagedMediaCampaign(
      resolvedOrganizationId,
      managedMediaCampaignId,
    );

    const resolvedProvider = text(providerId || managed?.provider || "internal");
    const resolvedProviderCampaignId =
      text(providerCampaignId || managed?.provider_campaign_id) || null;
    const resolvedCurrency = upper(currency || managed?.currency || "THB");
    const resolvedConfidence = Math.max(0, Math.min(1, number(confidence, 1)));

    const record = {
      organization_id: resolvedOrganizationId,
      provider_id: resolvedProvider,
      campaign_id: resolvedProviderCampaignId,
      campaign_name: campaign.campaign_name,
      customer_id: customerId || null,
      revenue: number(revenue),
      cost: number(cost),
      profit: number(profit),
      currency: resolvedCurrency,
      metadata: {
        ...object(metadata),
        source: "MARKETING_OUTCOME_ATTRIBUTION_RUNTIME",
      },
      marketing_campaign_id: resolvedCampaignId,
      managed_media_campaign_id: managed?.id || null,
      provider_campaign_id: resolvedProviderCampaignId,
      outcome_type: resolvedOutcomeType,
      qualified: Boolean(qualified),
      quantity: Math.max(0, number(quantity, 1)),
      party_id: partyId || null,
      lead_id: leadId || null,
      reservation_id: reservationId || null,
      order_id: orderId || null,
      invoice_id: invoiceId || null,
      source_document_type: text(sourceDocumentType) || null,
      source_document_id: text(sourceDocumentId) || null,
      attribution_model: upper(attributionModel || "DIRECT"),
      confidence: resolvedConfidence,
      idempotency_key: resolvedIdempotencyKey,
      occurred_at: occurredAt || new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("marketing_attribution")
      .upsert(record, {
        onConflict: "organization_id,idempotency_key",
        ignoreDuplicates: false,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data;
  },

  async resolveLineage({
    organizationId,
    sourceDocumentType = null,
    sourceDocumentId = null,
    leadId = null,
    reservationId = null,
    orderId = null,
    invoiceId = null,
  }) {
    const organization = text(organizationId);
    if (!organization) throw new Error("organizationId required");

    const base = () =>
      supabaseAdmin
        .from("marketing_attribution")
        .select(
          "id,organization_id,marketing_campaign_id,managed_media_campaign_id,provider_id,provider_campaign_id,attribution_model,confidence,source_document_type,source_document_id,lead_id,reservation_id,order_id,invoice_id,occurred_at",
        )
        .eq("organization_id", organization)
        .not("marketing_campaign_id", "is", null);

    const documentType = upper(sourceDocumentType);
    const documentId = text(sourceDocumentId);
    if (documentType && documentId) {
      const row = await latestLineageMatch(
        base()
          .eq("source_document_type", documentType)
          .eq("source_document_id", documentId),
      );
      if (row) return row;
    }

    const exactReferences = [
      ["lead_id", text(leadId)],
      ["reservation_id", text(reservationId)],
      ["order_id", text(orderId)],
      ["invoice_id", text(invoiceId)],
    ];

    for (const [column, value] of exactReferences) {
      if (!value) continue;
      const row = await latestLineageMatch(base().eq(column, value));
      if (row) return row;
    }

    return null;
  },

  async listByCampaigns({ organizationIds = [], campaignIds = [] }) {
    if (!organizationIds.length || !campaignIds.length) return [];

    const { data, error } = await supabaseAdmin
      .from("marketing_attribution")
      .select("*")
      .in("organization_id", organizationIds)
      .in("marketing_campaign_id", campaignIds)
      .order("occurred_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  summarize(rows = []) {
    const summary = new Map();

    for (const row of rows || []) {
      const campaignId = row.marketing_campaign_id;
      if (!campaignId) continue;

      if (!summary.has(campaignId)) {
        summary.set(campaignId, {
          leads: 0,
          qualified_conversions: 0,
          conversions: 0,
          attributed_revenue: 0,
          attributed_gross_profit: 0,
          outcome_cost: 0,
          outcome_events: 0,
          verified_outcome_events: 0,
          by_outcome_type: {},
        });
      }

      const item = summary.get(campaignId);
      const quantity = Math.max(0, number(row.quantity, 1));
      const outcomeType = upper(row.outcome_type || "CONVERSION");
      const confidence = Math.max(0, Math.min(1, number(row.confidence, 1)));

      item.outcome_events += 1;
      if (confidence >= 0.8) item.verified_outcome_events += 1;
      item.attributed_revenue += number(row.revenue);
      item.attributed_gross_profit += number(row.profit);
      item.outcome_cost += number(row.cost);
      item.by_outcome_type[outcomeType] =
        number(item.by_outcome_type[outcomeType]) + quantity;

      if (outcomeType.includes("LEAD")) item.leads += quantity;
      if (
        row.qualified === true ||
        ["BOOKING", "RESERVATION", "SALE", "PURCHASE", "PAYMENT", "CONTRACT", "DEPOSIT"]
          .includes(outcomeType)
      ) {
        item.qualified_conversions += quantity;
      }
      if (
        !["IMPRESSION", "CLICK", "VIEW", "LEAD"].includes(outcomeType)
      ) {
        item.conversions += quantity;
      }
    }

    return summary;
  },
};
