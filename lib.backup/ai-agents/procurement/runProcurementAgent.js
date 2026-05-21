import analyzeReplenishmentNeeds from "@/lib/procurement/replenishment/analyzeReplenishmentNeeds";

export default async function runProcurementAgent({
  tenant_id,
}) {

  try {

    const replenishment =
      await analyzeReplenishmentNeeds({
        tenant_id,
      });

    const decisions = [];

    for (const item of replenishment.recommendations || []) {

      decisions.push({

        ingredient:
          item.ingredient,

        action:
          "REORDER",

        quantity:
          item.recommended_purchase,
      });
    }

    return {

      success: true,

      agent:
        "PROCUREMENT",

      replenishment,

      decisions,
    };

  } catch (error) {

    return {

      success: false,

      agent:
        "PROCUREMENT",

      error:
        error.message,
    };
  }
}
