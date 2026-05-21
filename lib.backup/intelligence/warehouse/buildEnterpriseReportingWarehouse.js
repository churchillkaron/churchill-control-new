import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

import buildProductionCostingAI from "@/lib/intelligence/production/buildProductionCostingAI";

import buildPayrollIntelligence from "@/lib/intelligence/payroll/buildPayrollIntelligence";

import buildMarketingOptimizationAI from "@/lib/intelligence/marketing/buildMarketingOptimizationAI";

import buildCustomerLifetimeValueAI from "@/lib/intelligence/customers/buildCustomerLifetimeValueAI";

export default async function buildEnterpriseReportingWarehouse({
  tenant_id,
}) {

  try {

    const [
      executive,
      demand,
      production,
      payroll,
      marketing,
      customers,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildDemandPredictionAI({
        tenant_id,
      }),

      buildProductionCostingAI({
        tenant_id,
      }),

      buildPayrollIntelligence({
        tenant_id,
      }),

      buildMarketingOptimizationAI({
        tenant_id,
      }),

      buildCustomerLifetimeValueAI({
        tenant_id,
      }),
    ]);

    return {

      success: true,

      warehouse: {

        executive,

        demand,

        production,

        payroll,

        marketing,

        customers,
      },

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
