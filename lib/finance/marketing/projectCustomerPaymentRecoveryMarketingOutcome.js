import { MarketingPaymentRecoveryRuntime } from "@/lib/marketing/intelligence/MarketingPaymentRecoveryRuntime";

function text(value) {
  return String(value ?? "").trim();
}

export async function projectCustomerPaymentRecoveryMarketingOutcome({ input = {}, result = {} }) {
  const organizationId = text(input.organization_id || input.organizationId);
  const paymentId = text(input.payment_id || input.paymentId || result.payment_id || result.id);
  const targetStatus = text(input.target_status || input.targetStatus || result.status || "REVERSED").toUpperCase();

  if (!organizationId || !paymentId) {
    return {
      projected: false,
      reason: "CUSTOMER_PAYMENT_RECOVERY_ATTRIBUTION_CONTEXT_INCOMPLETE",
      outcomes: [],
    };
  }

  try {
    return await MarketingPaymentRecoveryRuntime.reversePayment({
      organizationId,
      paymentId,
      targetStatus,
      reason: input.reason || null,
    });
  } catch (error) {
    console.error("FINANCE_MARKETING_PAYMENT_RECOVERY_FAILED", {
      paymentId,
      targetStatus,
      message: error?.message || String(error),
    });
    return {
      projected: false,
      reason: "MARKETING_PAYMENT_RECOVERY_FAILED",
      outcomes: [],
      error: error?.message || String(error),
    };
  }
}

export default projectCustomerPaymentRecoveryMarketingOutcome;
