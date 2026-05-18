import analyzeKitchenEfficiency from "@/lib/ai-operations/kitchen/analyzeKitchenEfficiency";

import analyzeLaborEfficiency from "@/lib/ai-operations/labor/analyzeLaborEfficiency";

export default async function runCOOAgent({
  tenant_id,
}) {

  try {

    const kitchen =
      await analyzeKitchenEfficiency({
        tenant_id,
      });

    const labor =
      await analyzeLaborEfficiency({
        tenant_id,
      });

    const decisions = [];

    if (
      kitchen.kitchen_efficiency < 70
    ) {

      decisions.push({

        action:
          "ESCALATE_KITCHEN",

        priority:
          "HIGH",
      });
    }

    if (
      labor.average_labor_cost >
      50000
    ) {

      decisions.push({

        action:
          "OPTIMIZE_LABOR",

        priority:
          "MEDIUM",
      });
    }

    return {

      success: true,

      agent:
        "COO",

      operations: {

        kitchen,

        labor,
      },

      decisions,
    };

  } catch (error) {

    return {

      success: false,

      agent:
        "COO",

      error:
        error.message,
    };
  }
}
