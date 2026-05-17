import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

export default async function buildCrossLocationBenchmark() {

  try {

    const {
      data: tenants,
      error,
    } = await supabaseAdmin
      .from("tenants")
      .select("id,name");

    if (error) {
      throw error;
    }

    const benchmarks = [];

    for (const tenant of tenants || []) {

      const executive =
        await buildExecutiveOverview({
          tenant_id:
            tenant.id,
        });

      benchmarks.push({

        tenant_id:
          tenant.id,

        tenant_name:
          tenant.name,

        revenue:
          executive?.revenue
            ?.total_revenue || 0,

        customers:
          executive?.customers
            ?.total_customers || 0,

        operations:
          executive?.operations
            ?.status || "UNKNOWN",
      });
    }

    const rankedRevenue =
      [...benchmarks]
        .sort(
          (a, b) =>
            b.revenue -
            a.revenue
        );

    const rankedCustomers =
      [...benchmarks]
        .sort(
          (a, b) =>
            b.customers -
            a.customers
        );

    return {
      success: true,

      top_revenue_locations:
        rankedRevenue.slice(
          0,
          5
        ),

      top_customer_locations:
        rankedCustomers.slice(
          0,
          5
        ),

      all_locations:
        benchmarks,

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
