import analyzeKitchenEfficiency from "@/lib/ai-operations/kitchen/analyzeKitchenEfficiency";

export default async function runKitchenAgent({
  tenant_id,
}) {

  try {

    const kitchen =
      await analyzeKitchenEfficiency({
        tenant_id,
      });

    const decisions = [];

    if (
      kitchen.kitchen_efficiency < 80
    ) {

      decisions.push({

        action:
          "INCREASE_KITCHEN_CAPACITY",
      });
    }

    return {

      success: true,

      agent:
        "KITCHEN",

      kitchen,

      decisions,
    };

  } catch (error) {

    return {

      success: false,

      agent:
        "KITCHEN",

      error:
        error.message,
    };
  }
}
