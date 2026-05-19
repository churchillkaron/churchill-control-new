export function detectAnomalies({
  revenue = 0,
  averageRevenue = 0,
  foodCost = 0,
  averageFoodCost = 0,
  voids = 0,
  refunds = 0,
  discounts = 0,
}) {

  const anomalies = []

  /*
  |--------------------------------------------------------------------------
  | Revenue Drop
  |--------------------------------------------------------------------------
  */

  if (
    averageRevenue > 0 &&
    revenue < averageRevenue * 0.7
  ) {

    anomalies.push({
      type: 'critical',
      title: 'Revenue Drop',
      message: 'Revenue dropped more than 30% below average',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Food Cost Spike
  |--------------------------------------------------------------------------
  */

  if (
    averageFoodCost > 0 &&
    foodCost > averageFoodCost * 1.25
  ) {

    anomalies.push({
      type: 'warning',
      title: 'Food Cost Spike',
      message: 'Food cost significantly above operational average',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Refund Detection
  |--------------------------------------------------------------------------
  */

  if (refunds > 10) {

    anomalies.push({
      type: 'warning',
      title: 'High Refund Activity',
      message: 'Refund count exceeds operational threshold',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Void Detection
  |--------------------------------------------------------------------------
  */

  if (voids > 15) {

    anomalies.push({
      type: 'critical',
      title: 'High Void Activity',
      message: 'Possible cashier abuse or operational issue detected',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Discount Abuse
  |--------------------------------------------------------------------------
  */

  if (discounts > 20) {

    anomalies.push({
      type: 'warning',
      title: 'Discount Abuse Risk',
      message: 'Discount usage exceeds expected operational pattern',
    })
  }

  return anomalies
}
