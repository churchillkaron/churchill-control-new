import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildCustomerRetentionAI({
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

    const now =
      new Date();

    const analysis =
      Object.values(
        customerMap
      )
      .map(
        (customer) => {

          const daysSinceVisit =
            Math.floor(
              (
                now -
                new Date(
                  customer.last_visit
                )
              ) /
              (
                1000 *
                60 *
                60 *
                24
              )
            );

          let retentionRisk =
            "LOW";

          let action =
            "Maintain engagement.";

          if (
            daysSinceVisit > 30
          ) {

            retentionRisk =
              "MEDIUM";

            action =
              "Send return promotion.";
          }

          if (
            daysSinceVisit > 60
          ) {

            retentionRisk =
              "HIGH";

            action =
              "Launch win-back campaign immediately.";
          }

          if (
            customer.revenue >
            50000 &&
            daysSinceVisit > 30
          ) {

            retentionRisk =
              "VIP_RISK";

            action =
              "Personal outreach recommended.";
          }

          return {

            ...customer,

            days_since_visit:
              daysSinceVisit,

            retention_risk:
              retentionRisk,

            action,
          };
        }
      )
      .sort(
        (a, b) =>
          b.days_since_visit -
          a.days_since_visit
      );

    return {

      success: true,

      summary: {

        total_customers:
          analysis.length,

        high_risk:
          analysis.filter(
            (c) =>
              c.retention_risk ===
              "HIGH"
          ).length,

        vip_risk:
          analysis.filter(
            (c) =>
              c.retention_risk ===
              "VIP_RISK"
          ).length,
      },

      customers:
        analysis.slice(
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
