import runKitchenAgent from "@/lib/ai-agents/kitchen/runKitchenAgent";

import runProcurementAgent from "@/lib/ai-agents/procurement/runProcurementAgent";

import runCFOAgent from "@/lib/ai-agents/cfo/runCFOAgent";

import runHRAgent from "@/lib/ai-agents/hr/runHRAgent";

export default async function runEventSubscribers({
  tenant_id,
  event,
}) {

  try {

    let result = null;

    // ===== ORDER CREATED =====
    if (
      event.event_type ===
      "ORDER_CREATED"
    ) {

      result =
        await runKitchenAgent({
          tenant_id,
        });
    }

    // ===== LOW STOCK =====
    if (
      event.event_type ===
      "LOW_STOCK_DETECTED"
    ) {

      result =
        await runProcurementAgent({
          tenant_id,
        });
    }

    // ===== FINANCIAL RISK =====
    if (
      event.event_type ===
      "HIGH_FINANCIAL_RISK"
    ) {

      result =
        await runCFOAgent({
          tenant_id,
        });
    }

    // ===== STAFF OVERLOAD =====
    if (
      event.event_type ===
      "STAFF_OVERLOAD"
    ) {

      result =
        await runHRAgent({
          tenant_id,
        });
    }

    return {

      success: true,

      subscriber_result:
        result,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
