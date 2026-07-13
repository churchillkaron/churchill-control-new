import { generateFinancialStatements } from "./core/generateFinancialStatements";
import { getWorkingCapital } from "./getWorkingCapital";
import { getForecastVsActual } from "./getForecastVsActual";
import { getLiquidityMetrics } from "../capabilities/getLiquidityMetrics";
import { calculateBudgetVariance } from "@/lib/finance/budgeting/capabilities/calculateBudgetVariance";


export async function getManagementReport({
  organizationId,
  startDate,
  endDate,
  budgets = [],
  actuals = [],
}) {

  const statements =
    await generateFinancialStatements({
      organizationId,
      startDate,
      endDate,
    });


  const workingCapital =
    await getWorkingCapital({
      organizationId,
      startDate,
      endDate,
    });


  const liquidity =
    await getLiquidityMetrics({
      organizationId,
      startDate,
      endDate,
    });


  const forecastVsActual =
    await getForecastVsActual({
      organizationId,
    });


  const budgetVsActual =
    calculateBudgetVariance({
      budgets,
      actuals,
    });


  return {

    organizationId,

    period:{
      startDate,
      endDate,
    },

    statements,

    workingCapital,

    liquidity,

    forecastVsActual,

    budgetVsActual,

  };

}
