import analyzeRevenueOptimization from "@/lib/ai-operations/revenue/analyzeRevenueOptimization";

export default async function predictStaffingNeeds({
  tenant_id,
}) {

  try {

    const revenue =
      await analyzeRevenueOptimization({
        tenant_id,
      });

    let recommendedStaff = 3;

    if (
      revenue.revenue > 50000
    ) {

      recommendedStaff = 8;

    } else if (
      revenue.revenue > 20000
    ) {

      recommendedStaff = 5;
    }

    return {

      success: true,

      projected_revenue:
        revenue.revenue,

      recommended_staff:
        recommendedStaff,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
