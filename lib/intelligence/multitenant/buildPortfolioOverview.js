import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

export default async function buildPortfolioOverview() {

  try {

    const {
      data: tenants,
      error,
    } = await supabaseAdmin
      .from("tenants")
      .select("id,name")
      .limit(100);

    if (error) {
      throw error;
    }

    const portfolio = [];

    for (const tenant of tenants || []) {

      const executive =
        await buildExecutiveOverview({
          tenant_id:
            tenant.id,
        });

      portfolio.push({

        tenant_id:
          tenant.id,

        tenant_name:
          tenant.name,

        revenue:
          executive?.revenue
            ?.total_revenue || 0,

        operations:
          executive?.operations
            ?.status || "UNKNOWN",

        customers:
          executive?.customers
            ?.total_customers || 0,
      });
    }

    const totalRevenue =
      portfolio.reduce(
        (sum, item) =>
          sum +
          Number(
            item.revenue || 0
          ),
        0
      );

    return {
      success: true,

      total_locations:
        portfolio.length,

      portfolio_revenue:
        totalRevenue,

      locations:
        portfolio,

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
