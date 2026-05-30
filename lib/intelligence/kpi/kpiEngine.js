export function calculateKPIs({
  revenue = 0,
  orders = 0,
  tables = 0,
  laborCost = 0,
  foodCost = 0,
  refunds = 0,
}) {

  const avgOrderValue =
    orders > 0
      ? revenue / orders
      : 0

  const revenuePerTable =
    tables > 0
      ? revenue / tables
      : 0

  const laborRatio =
    revenue > 0
      ? (laborCost / revenue) * 100
      : 0

  const refundRatio =
    orders > 0
      ? (refunds / orders) * 100
      : 0

  let operationalScore = 100

  /*
  |--------------------------------------------------------------------------
  | Revenue Efficiency
  |--------------------------------------------------------------------------
  */

  if (avgOrderValue > 500) {
    operationalScore += 10
  }

  if (revenuePerTable > 3000) {
    operationalScore += 10
  }

  /*
  |--------------------------------------------------------------------------
  | Food Cost
  |--------------------------------------------------------------------------
  */

  if (foodCost > 35) {
    operationalScore -= 20
  }

  /*
  |--------------------------------------------------------------------------
  | Labor Cost
  |--------------------------------------------------------------------------
  */

  if (laborRatio > 35) {
    operationalScore -= 15
  }

  /*
  |--------------------------------------------------------------------------
  | Refunds
  |--------------------------------------------------------------------------
  */

  if (refundRatio > 5) {
    operationalScore -= 15
  }

  let state = 'GOOD'

  if (operationalScore >= 115) {
    state = 'EXCELLENT'
  }

  if (operationalScore < 90) {
    state = 'WARNING'
  }

  if (operationalScore < 70) {
    state = 'CRITICAL'
  }

  return {

    avgOrderValue:
      Number(
        avgOrderValue.toFixed(2)
      ),

    revenuePerTable:
      Number(
        revenuePerTable.toFixed(2)
      ),

    laborRatio:
      Number(
        laborRatio.toFixed(2)
      ),

    refundRatio:
      Number(
        refundRatio.toFixed(2)
      ),

    operationalScore,

    state,
  }
}
