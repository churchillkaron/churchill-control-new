import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

export default async function buildEnterpriseFederationLayer() {

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

    const federation = [];

    for (const tenant of tenants || []) {

      const [
        executive,
        investor,
      ] = await Promise.all([

        buildExecutiveOverview({
          tenant_id:
            tenant.id,
        }),

        buildInvestorIntelligenceEngine({
          tenant_id:
            tenant.id,
        }),
      ]);

      federation.push({

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

        valuation:
          investor
            ?.investor_snapshot
            ?.estimated_valuation || 0,

        investment_score:
          investor
            ?.investor_snapshot
            ?.investment_score || 0,
      });
    }

    const totalRevenue =
      federation.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.revenue || 0
          ),
        0
      );

    const totalValuation =
      federation.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.valuation || 0
          ),
        0
      );

    return {

      success: true,

      federation_summary: {

        brands:
          federation.length,

        total_revenue:
          Number(
            totalRevenue.toFixed(2)
          ),

        total_valuation:
          Number(
            totalValuation.toFixed(2)
          ),
      },

      federation:
        federation.sort(
          (a, b) =>
            b.revenue -
            a.revenue
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
