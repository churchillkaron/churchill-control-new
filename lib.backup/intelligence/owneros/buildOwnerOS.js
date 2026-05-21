import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildAutonomousOptimizationEngine from "@/lib/intelligence/optimization/buildAutonomousOptimizationEngine";

import buildCrossLocationBenchmark from "@/lib/intelligence/benchmark/buildCrossLocationBenchmark";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

import buildProductionCostingAI from "@/lib/intelligence/production/buildProductionCostingAI";

import buildPayrollIntelligence from "@/lib/intelligence/payroll/buildPayrollIntelligence";

import buildSupplierIntelligence from "@/lib/intelligence/procurement/buildSupplierIntelligence";

export default async function buildOwnerOS({
  tenant_id,
}) {

  try {

    const [
      executive,
      optimization,
      benchmark,
      demand,
      production,
      payroll,
      suppliers,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildAutonomousOptimizationEngine({
        tenant_id,
      }),

      buildCrossLocationBenchmark(),

      buildDemandPredictionAI({
        tenant_id,
      }),

      buildProductionCostingAI({
        tenant_id,
      }),

      buildPayrollIntelligence({
        tenant_id,
      }),

      buildSupplierIntelligence({
        tenant_id,
      }),
    ]);

    return {

      success: true,

      executive,

      optimization,

      benchmark,

      demand,

      production,

      payroll,

      suppliers,

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
