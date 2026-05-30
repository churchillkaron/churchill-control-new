import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildNeuralForecastEngine({
  tenant_id,
}) {

  try {

    const {
      data: sales,
      error,
    } = await supabaseAdmin
      .from("daily_sales")
      .select(`
        revenue,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .order(
        "created_at",
        {
          ascending: true,
        }
      )
      .limit(365);

    if (error) {
      throw error;
    }

    const revenues =
      (sales || []).map(
        (item) =>
          Number(
            item.revenue || 0
          )
      );

    const total =
      revenues.reduce(
        (sum, value) =>
          sum + value,
        0
      );

    const average =
      revenues.length > 0
        ? total /
          revenues.length
        : 0;

    const trend =
      revenues.length > 1
        ? revenues[
            revenues.length - 1
          ] -
          revenues[0]
        : 0;

    const volatility =
      revenues.length > 0
        ? Math.max(
            ...revenues
          ) -
          Math.min(
            ...revenues
          )
        : 0;

    const forecasts = [];

    for (
      let i = 1;
      i <= 30;
      i++
    ) {

      const growthFactor =
        trend > 0
          ? 1 + i * 0.002
          : 1 - i * 0.001;

      const prediction =
        Number(
          (
            average *
            growthFactor
          ).toFixed(2)
        );

      let confidence =
        "HIGH";

      if (
        volatility >
        average
      ) {

        confidence =
          "MEDIUM";
      }

      if (
        volatility >
        average * 2
      ) {

        confidence =
          "LOW";
      }

      forecasts.push({

        day_offset:
          i,

        predicted_revenue:
          prediction,

        confidence,
      });
    }

    return {

      success: true,

      baseline: {

        average_revenue:
          Number(
            average.toFixed(2)
          ),

        volatility:
          Number(
            volatility.toFixed(2)
          ),

        trend:
          Number(
            trend.toFixed(2)
          ),
      },

      forecasts,

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
