import { getTenantSetting } from "@/lib/shared/tenant/getTenantSetting";
import { executeConsumptionDeduction } from "@/lib/production/executeConsumptionDeduction";

export async function processConsumptionEvent({
  tenantId,
  eventType,
  referenceId,
  payload = {},
}) {
  try {
    const policy = await getTenantSetting(
      tenantId,
      "production",
      "inventory_consumption_policy"
    );

    if (!policy) {
      console.log("NO INVENTORY POLICY FOUND");

      return {
        success: false,
        skipped: true,
        reason: "NO_POLICY",
      };
    }

    const trigger = policy?.trigger;

    if (trigger !== eventType) {
      console.log("EVENT DOES NOT MATCH POLICY");

      return {
        success: false,
        skipped: true,
        reason: "TRIGGER_MISMATCH",
      };
    }

    const strategy = policy?.strategy || "REAL_TIME";

    if (strategy !== "REAL_TIME") {
      return {
        success: true,
        skipped: true,
        reason: "NON_REALTIME_STRATEGY",
        strategy,
      };
    }

    const dishId = payload?.dish_id;
    const quantity = payload?.quantity || 1;

    if (!dishId) {
      return {
        success: false,
        error: "MISSING_DISH_ID",
      };
    }

    const deductionResult =
      await executeConsumptionDeduction({
        tenantId,
        dishId,
        quantity,
        referenceId,
        source: eventType,
      });

    return {
      success: deductionResult?.success || false,
      strategy,
      eventType,
      referenceId,
      result: deductionResult,
    };
  } catch (error) {
    console.error("PROCESS CONSUMPTION EVENT ERROR:", error);

    return {
      success: false,
      skipped: false,
      error: error.message,
    };
  }
}
