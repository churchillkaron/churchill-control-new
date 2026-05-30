export function generateForecast({
  revenueHistory = [],
  costHistory = [],
  payrollHistory = [],
}) {

  function average(list) {

    if (!list.length) {
      return 0
    }

    return (
      list.reduce(
        (sum, value) =>
          sum + Number(value || 0),
        0
      ) / list.length
    )
  }

  const avgRevenue =
    average(revenueHistory)

  const avgCost =
    average(costHistory)

  const avgPayroll =
    average(payrollHistory)

  const projectedRevenue =
    avgRevenue * 1.08

  const projectedCost =
    avgCost * 1.03

  const projectedPayroll =
    avgPayroll * 1.02

  const projectedProfit =
    projectedRevenue -
    projectedCost -
    projectedPayroll

  let growthState = 'STABLE'

  if (projectedProfit > avgRevenue * 0.25) {
    growthState = 'HIGH GROWTH'
  }

  if (projectedProfit < avgRevenue * 0.10) {
    growthState = 'RISK'
  }

  return {

    averageRevenue:
      Math.round(avgRevenue),

    averageCost:
      Math.round(avgCost),

    averagePayroll:
      Math.round(avgPayroll),

    projectedRevenue:
      Math.round(projectedRevenue),

    projectedCost:
      Math.round(projectedCost),

    projectedPayroll:
      Math.round(projectedPayroll),

    projectedProfit:
      Math.round(projectedProfit),

    growthState,
  }
}
