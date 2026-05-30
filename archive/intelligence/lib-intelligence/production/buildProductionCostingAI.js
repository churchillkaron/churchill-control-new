import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildProductionCostingAI({
  tenant_id,
}) {

  try {

    const {
      data: recipes,
      error,
    } = await supabaseAdmin
      .from("recipes")
      .select(`
        id,
        name,
        cost_per_unit,
        selling_price,
        category
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(1000);

    if (error) {
      throw error;
    }

    const analysis = [];

    let totalCost = 0;

    let totalRevenue = 0;

    for (const recipe of recipes || []) {

      const cost =
        Number(
          recipe.cost_per_unit || 0
        );

      const selling =
        Number(
          recipe.selling_price || 0
        );

      const profit =
        selling - cost;

      const margin =
        selling > 0
          ? (
              (profit / selling) *
              100
            ).toFixed(2)
          : 0;

      let health =
        "GOOD";

      if (
        margin < 20
      ) {

        health =
          "LOW_MARGIN";
      }

      if (
        margin < 10
      ) {

        health =
          "CRITICAL";
      }

      totalCost += cost;

      totalRevenue += selling;

      analysis.push({

        recipe:
          recipe.name,

        category:
          recipe.category,

        cost,

        selling_price:
          selling,

        profit,

        margin,

        health,
      });
    }

    const averageMargin =
      analysis.length > 0
        ? (
            analysis.reduce(
              (
                sum,
                item
              ) =>
                sum +
                Number(
                  item.margin
                ),
              0
            ) /
            analysis.length
          ).toFixed(2)
        : 0;

    return {

      success: true,

      summary: {

        total_items:
          analysis.length,

        total_cost:
          totalCost,

        total_revenue:
          totalRevenue,

        average_margin:
          averageMargin,
      },

      analysis:
        analysis.sort(
          (a, b) =>
            Number(a.margin) -
            Number(b.margin)
        ),

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
