import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildCustomerLifetimeValueAI({
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
        customer_name,
        customer_phone,
        total,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(10000);

    if (error) {
      throw error;
    }

    const customerMap = {};

    for (const order of orders || []) {

      const key =
        order.customer_phone ||
        order.customer_name ||
        "UNKNOWN";

      if (
        !customerMap[key]
      ) {

        customerMap[key] = {

          customer:
            order.customer_name ||
            "UNKNOWN",

          phone:
            order.customer_phone ||
            "-",

          visits: 0,

          revenue: 0,

          first_visit:
            order.created_at,

          last_visit:
            order.created_at,
        };
      }

      customerMap[key]
        .visits += 1;

      customerMap[key]
        .revenue +=
        Number(
          order.total || 0
        );

      if (
        new Date(
          order.created_at
        ) <
        new Date(
          customerMap[key]
            .first_visit
        )
      ) {

        customerMap[key]
          .first_visit =
          order.created_at;
      }

      if (
        new Date(
          order.created_at
        ) >
        new Date(
          customerMap[key]
            .last_visit
        )
      ) {

        customerMap[key]
          .last_visit =
          order.created_at;
      }
    }

    const customers =
      Object.values(
        customerMap
      )
      .map(
        (customer) => {

          const averageSpend =
            customer.visits > 0
              ? (
                  customer.revenue /
                  customer.visits
                ).toFixed(2)
              : 0;

          let tier =
            "STANDARD";

          if (
            customer.revenue >
            50000
          ) {

            tier =
              "VIP";
          }

          if (
            customer.revenue >
            100000
          ) {

            tier =
              "ELITE";
          }

          return {

            ...customer,

            average_spend:
              averageSpend,

            tier,
          };
        }
      )
      .sort(
        (a, b) =>
          b.revenue -
          a.revenue
      );

    const totalRevenue =
      customers.reduce(
        (
          sum,
          customer
        ) =>
          sum +
          customer.revenue,
        0
      );

    return {

      success: true,

      summary: {

        total_customers:
          customers.length,

        total_customer_revenue:
          totalRevenue,

        vip_customers:
          customers.filter(
            (c) =>
              c.tier ===
              "VIP"
          ).length,

        elite_customers:
          customers.filter(
            (c) =>
              c.tier ===
              "ELITE"
          ).length,
      },

      customers:
        customers.slice(
          0,
          100
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
