import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { MarketingOutcomeAttributionRuntime } from "@/lib/marketing/intelligence/MarketingOutcomeAttributionRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const MarketingFulfillmentCostRecoveryRuntime = {
  async recoverSalesOrderFulfillment({
    organizationId,
    salesOrderId,
    reason = null,
  }) {
    const organization = text(organizationId);
    const order = text(salesOrderId);

    if (!organization) throw new Error("organizationId required");
    if (!order) throw new Error("salesOrderId required");

    const { data, error } = await supabaseAdmin
      .from("marketing_attribution")
      .select("*")
      .eq("organization_id", organization)
      .eq("source_document_type", "SALES_ORDER")
      .eq("source_document_id", order)
      .eq("outcome_type", "FULFILLMENT_COGS")
      .not("marketing_campaign_id", "is", null)
      .order("occurred_at", { ascending: true });

    if (error) throw error;
    const originals = data || [];

    if (!originals.length) {
      return {
        projected: false,
        reason: "FULFILLMENT_HAS_NO_MARKETING_COGS_ATTRIBUTION",
        outcomes: [],
      };
    }

    const outcomes = [];

    for (const original of originals) {
      try {
        const originalCost = Math.abs(number(original.cost, 0));
        const outcome = await MarketingOutcomeAttributionRuntime.record({
          organizationId: organization,
          marketingCampaignId: original.marketing_campaign_id,
          managedMediaCampaignId: original.managed_media_campaign_id,
          providerId: original.provider_id || "internal",
          providerCampaignId: original.provider_campaign_id || null,
          outcomeType: "FULFILLMENT_COGS_RECOVERY",
          qualified: false,
          quantity: 0,
          revenue: 0,
          cost: -originalCost,
          profit: originalCost,
          currency: original.currency,
          partyId: original.party_id,
          customerId: original.customer_id,
          leadId: original.lead_id,
          reservationId: original.reservation_id,
          orderId: original.order_id || order,
          invoiceId: original.invoice_id,
          sourceDocumentType: "SALES_ORDER_FULFILLMENT_RETURN",
          sourceDocumentId: order,
          attributionModel: "RECOVERY_OF_DIRECT",
          confidence: number(original.confidence, 1),
          idempotencyKey: [
            "marketing-fulfillment-cogs-recovery",
            organization,
            order,
            original.id,
          ].join(":"),
          metadata: {
            inventory_projection: true,
            inventory_stage: "SALES_ORDER_FULFILLMENT_RETURNED",
            original_attribution_id: original.id,
            original_outcome_type: original.outcome_type,
            original_cost: originalCost,
            recovery_reason: reason ? text(reason) : null,
          },
        });

        outcomes.push({ original_attribution_id: original.id, ...outcome });
      } catch (projectionError) {
        console.error("MARKETING_FULFILLMENT_COGS_RECOVERY_FAILED", {
          salesOrderId: order,
          attributionId: original.id,
          message: projectionError?.message || String(projectionError),
        });
        outcomes.push({
          original_attribution_id: original.id,
          projected: false,
          reason: "MARKETING_FULFILLMENT_COGS_RECOVERY_FAILED",
          error: projectionError?.message || String(projectionError),
        });
      }
    }

    return {
      projected: outcomes.some((outcome) => Boolean(outcome.id)),
      outcomes,
    };
  },
};

export default MarketingFulfillmentCostRecoveryRuntime;
