import buildAutonomousOptimizationEngine from "@/lib/intelligence/optimization/buildAutonomousOptimizationEngine";

import buildInventoryForecastAI from "@/lib/intelligence/inventory/buildInventoryForecastAI";

import buildPredictiveStaffing from "@/lib/intelligence/staffing/buildPredictiveStaffing";

import buildFoodWasteReductionAI from "@/lib/intelligence/waste/buildFoodWasteReductionAI";

import publishEvent from "@/lib/intelligence/events/storeSystemEvent";

export default async function buildAutonomousRestaurantOrchestrator({
  tenant_id,
}) {

  try {

    const [
      optimization,
      inventory,
      staffing,
      waste,
    ] = await Promise.all([

      buildAutonomousOptimizationEngine({
        tenant_id,
      }),

      buildInventoryForecastAI({
        tenant_id,
      }),

      buildPredictiveStaffing({
        tenant_id,
      }),

      buildFoodWasteReductionAI({
        tenant_id,
      }),
    ]);

    const actions = [];

    const criticalInventory =
      inventory?.forecast?.filter(
        (item) =>
          item.risk ===
          "CRITICAL"
      ) || [];

    if (
      criticalInventory.length > 0
    ) {

      actions.push({

        type:
          "INVENTORY_RESTOCK",

        priority:
          "HIGH",

        message:
          `${criticalInventory.length} inventory items require urgent restocking.`,
      });
    }

    if (
      staffing?.staffing_level ===
      "HIGH_DEMAND"
    ) {

      actions.push({

        type:
          "STAFFING_EXPANSION",

        priority:
          "HIGH",

        message:
          "Increase staffing coverage for projected demand.",
      });
    }

    if (
      waste?.critical_items > 0
    ) {

      actions.push({

        type:
          "FOOD_WASTE_CONTROL",

        priority:
          "MEDIUM",

        message:
          "Operational waste reduction intervention recommended.",
      });
    }

    if (
      optimization?.optimization_count > 0
    ) {

      actions.push({

        type:
          "BUSINESS_OPTIMIZATION",

        priority:
          "MEDIUM",

        message:
          `${optimization.optimization_count} optimization opportunities detected.`,
      });
    }

    for (const action of actions) {

      await publishEvent({

        tenant_id,

        type:
          action.type,

        payload:
          action,
      });
    }

    return {

      success: true,

      autonomous_actions:
        actions,

      total_actions:
        actions.length,

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
