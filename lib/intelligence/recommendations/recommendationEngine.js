export function generateRecommendations({
  revenue = 0,
  foodCost = 0,
  lowStock = 0,
  kitchenLoad = 0,
  payrollRatio = 0,
  anomalies = [],
}) {

  const recommendations = []

  /*
  |--------------------------------------------------------------------------
  | Revenue Recommendations
  |--------------------------------------------------------------------------
  */

  if (revenue < 50000) {

    recommendations.push({
      priority: 'high',
      category: 'sales',
      title: 'Increase Revenue Generation',
      action:
        'Launch promotions, improve upselling, and activate marketing campaigns',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Food Cost Recommendations
  |--------------------------------------------------------------------------
  */

  if (foodCost > 35) {

    recommendations.push({
      priority: 'critical',
      category: 'production',
      title: 'Reduce Food Cost',
      action:
        'Review recipes, supplier pricing, inventory waste, and portion control',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Inventory Recommendations
  |--------------------------------------------------------------------------
  */

  if (lowStock > 0) {

    recommendations.push({
      priority: 'high',
      category: 'inventory',
      title: 'Restock Critical Inventory',
      action:
        `Replenish ${lowStock} low stock ingredients immediately`,
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Kitchen Recommendations
  |--------------------------------------------------------------------------
  */

  if (kitchenLoad > 20) {

    recommendations.push({
      priority: 'medium',
      category: 'operations',
      title: 'Optimize Kitchen Flow',
      action:
        'Adjust staffing or prep scheduling to reduce kitchen bottlenecks',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Payroll Recommendations
  |--------------------------------------------------------------------------
  */

  if (payrollRatio > 0.35) {

    recommendations.push({
      priority: 'high',
      category: 'payroll',
      title: 'Reduce Payroll Pressure',
      action:
        'Review schedules, attendance efficiency, and labor allocation',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Anomaly Recommendations
  |--------------------------------------------------------------------------
  */

  if (anomalies.length > 0) {

    recommendations.push({
      priority: 'critical',
      category: 'risk',
      title: 'Investigate Operational Anomalies',
      action:
        'Review suspicious operational patterns and management reports',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Stable Operations
  |--------------------------------------------------------------------------
  */

  if (recommendations.length === 0) {

    recommendations.push({
      priority: 'info',
      category: 'executive',
      title: 'Operations Stable',
      action:
        'System performance is healthy. Continue monitoring operational KPIs',
    })
  }

  return recommendations
}
