import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { MarketingOutcomeAttributionRuntime } from "@/lib/marketing/intelligence/MarketingOutcomeAttributionRuntime";

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

export const MarketingPaymentRecoveryRuntime = {
  async reversePayment({
    organizationId,
    paymentId,
    targetStatus = "REVERSED",
    reason = null,
  }) {
    const organization = text(organizationId);
    const payment = text(paymentId);
    const status = upper(targetStatus || "REVERSED");

    if (!organization) throw new Error("organizationId required");
    if (!payment) throw new Error("paymentId required");
    if (!["REVERSED", "REFUNDED"].includes(status)) {
      throw new Error("targetStatus must be REVERSED or REFUNDED");
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_attribution")
      .select("*")
      .eq("organization_id", organization)
      .eq("source_document_type", "CUSTOMER_PAYMENT")
      .eq("source_document_id", payment)
      .eq("outcome_type", "PAYMENT")
      .not("marketing_campaign_id", "is", null)
      .order("occurred_at", { ascending: true });

    if (error) throw error;
    const originals = data || [];

    if (!originals.length) {
      return {
        projected: false,
        reason: "CUSTOMER_PAYMENT_HAS_NO_MARKETING_ATTRIBUTION",
        outcomes: [],
      };
    }

    const outcomes = [];
    for (const original of originals) {
      try {
        const outcome = await MarketingOutcomeAttributionRuntime.record({
          organizationId: organization,
          marketingCampaignId: original.marketing_campaign_id,
          managedMediaCampaignId: original.managed_media_campaign_id,
          providerId: original.provider_id || "internal",
          providerCampaignId: original.provider_campaign_id || null,
          outcomeType: status === "REFUNDED" ? "PAYMENT_REFUND" : "PAYMENT_REVERSAL",
          qualified: false,
          quantity: 0,
          revenue: -Math.abs(number(original.revenue, 0)),
          cost: -Math.abs(number(original.cost, 0)),
          profit: -Math.abs(number(original.profit, 0)),
          currency: original.currency,
          partyId: original.party_id,
          customerId: original.customer_id,
          leadId: original.lead_id,
          reservationId: original.reservation_id,
          orderId: original.order_id,
          invoiceId: original.invoice_id,
          sourceDocumentType: "CUSTOMER_PAYMENT_RECOVERY",
          sourceDocumentId: payment,
          attributionModel: "RECOVERY_OF_DIRECT",
          confidence: number(original.confidence, 1),
          idempotencyKey: [
            "marketing-payment-recovery",
            organization,
            payment,
            status,
            original.id,
          ].join(":"),
          metadata: {
            finance_projection: true,
            finance_stage: status === "REFUNDED" ? "CUSTOMER_PAYMENT_REFUNDED" : "CUSTOMER_PAYMENT_REVERSED",
            original_attribution_id: original.id,
            original_outcome_type: original.outcome_type,
            original_revenue: number(original.revenue, 0),
            recovery_reason: reason ? text(reason) : null,
          },
        });

        outcomes.push({ original_attribution_id: original.id, ...outcome });
      } catch (projectionError) {
        console.error("MARKETING_PAYMENT_RECOVERY_PROJECTION_FAILED", {
          paymentId: payment,
          attributionId: original.id,
          message: projectionError?.message || String(projectionError),
        });
        outcomes.push({
          original_attribution_id: original.id,
          projected: false,
          reason: "MARKETING_PAYMENT_RECOVERY_PROJECTION_FAILED",
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

export default MarketingPaymentRecoveryRuntime;
