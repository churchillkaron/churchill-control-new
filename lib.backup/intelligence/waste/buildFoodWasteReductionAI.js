import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildFoodWasteReductionAI({
  tenant_id,
}) {

  try {

    const {
      data: waste,
      error,
    } = await supabaseAdmin
      .from("inventory_waste")
      .select(`
        id,
        item_name,
        quantity,
        cost,
        reason,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(5000);

    if (error) {
      throw error;
    }

    let totalWasteCost = 0;

    const itemMap = {};

    for (const row of waste || []) {

      const item =
        row.item_name ||
        "UNKNOWN";

      const cost =
        Number(
          row.cost || 0
        );

      totalWasteCost += cost;

      if (
        !itemMap[item]
      ) {

        itemMap[item] = {

          item,

          total_quantity: 0,

          total_cost: 0,

          incidents: 0,

          reasons: {},
        };
      }

      itemMap[item]
        .total_quantity +=
        Number(
          row.quantity || 0
        );

      itemMap[item]
        .total_cost +=
        cost;

      itemMap[item]
        .incidents += 1;

      const reason =
        row.reason ||
        "UNKNOWN";

      if (
        !itemMap[item]
          .reasons[reason]
      ) {

        itemMap[item]
          .reasons[
            reason
          ] = 0;
      }

      itemMap[item]
        .reasons[
          reason
        ] += 1;
    }

    const analysis =
      Object.values(
        itemMap
      )
      .sort(
        (a, b) =>
          b.total_cost -
          a.total_cost
      )
      .map(
        (item) => {

          let recommendation =
            "Monitor usage.";

          if (
            item.total_cost >
            5000
          ) {

            recommendation =
              "Reduce purchasing quantity and improve demand planning.";
          }

          if (
            item.incidents >
            10
          ) {

            recommendation =
              "Investigate operational handling and kitchen workflow.";
          }

          return {

            ...item,

            recommendation,
          };
        }
      );

    return {

      success: true,

      total_waste_cost:
        totalWasteCost,

      critical_items:
        analysis.filter(
          (item) =>
            item.total_cost >
            5000
        ).length,

      analysis,

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
