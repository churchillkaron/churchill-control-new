import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

export default async function buildFranchiseIntelligenceNetwork() {

  try {

    const {
      data: tenants,
      error,
    } = await supabaseAdmin
      .from("tenants")
      .select(`
        id,
        name,
        created_at
      `)
      .limit(1000);

    if (error) {
      throw error;
    }

    const network = [];

    for (const tenant of tenants || []) {

      const [
        executive,
        demand,
      ] = await Promise.all([

        buildExecutiveOverview({
          tenant_id:
            tenant.id,
        }),

        buildDemandPredictionAI({
          tenant_id:
            tenant.id,
        }),
      ]);

      network.push({

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

        peak_day:
          demand?.peak_day
            ?.day || "-",

        peak_revenue:
          demand?.peak_day
            ?.revenue || 0,
      });
    }

    const ranked =
      network.sort(
        (a, b) =>
          b.revenue -
          a.revenue
      );

    return {

      success: true,

      total_locations:
        network.length,

      top_performers:
        ranked.slice(
          0,
          10
        ),

      network,

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
