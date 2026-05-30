import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildDemandPredictionAI({
  tenant_id,
}) {

  try {

    const {
      data: orders,
      error,
    } = await supabaseAdmin
      .from("orders")
      .select(`
        id,
        total,
        created_at,
        status
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(5000);

    if (error) {
      throw error;
    }

    const weekdayMap = {

      0: {
        day: "Sunday",
        orders: 0,
        revenue: 0,
      },

      1: {
        day: "Monday",
        orders: 0,
        revenue: 0,
      },

      2: {
        day: "Tuesday",
        orders: 0,
        revenue: 0,
      },

      3: {
        day: "Wednesday",
        orders: 0,
        revenue: 0,
      },

      4: {
        day: "Thursday",
        orders: 0,
        revenue: 0,
      },

      5: {
        day: "Friday",
        orders: 0,
        revenue: 0,
      },

      6: {
        day: "Saturday",
        orders: 0,
        revenue: 0,
      },
    };

    for (const order of orders || []) {

      const date =
        new Date(
          order.created_at
        );

      const day =
        date.getDay();

      weekdayMap[
        day
      ].orders += 1;

      weekdayMap[
        day
      ].revenue +=
        Number(
          order.total || 0
        );
    }

    const demand =
      Object.values(
        weekdayMap
      ).map(
        (item) => ({

          ...item,

          average_order_value:
            item.orders > 0
              ? (
                  item.revenue /
                  item.orders
                ).toFixed(2)
              : 0,
        })
      );

    const ranked =
      [...demand]
        .sort(
          (a, b) =>
            b.revenue -
            a.revenue
        );

    const peak =
      ranked[0];

    const lowest =
      ranked[
        ranked.length - 1
      ];

    return {

      success: true,

      peak_day:
        peak,

      lowest_day:
        lowest,

      demand,

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
