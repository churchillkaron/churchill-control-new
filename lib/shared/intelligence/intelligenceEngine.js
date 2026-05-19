export function calculateIntelligence({
  revenue = 0,
  cost = 0,
  orders = 0,
  activeTables = 0,
  lowStock = 0,
  kitchenTickets = 0,
  attendanceIssues = 0,
  pendingApprovals = 0,
  base = 100,
}) {

  const alerts = []

  const foodCost =
    revenue > 0
      ? (cost / revenue) * 100
      : 0

  let score = base

  /*
  |--------------------------------------------------------------------------
  | Revenue Intelligence
  |--------------------------------------------------------------------------
  */

  if (revenue > 0) {
    score += 10
  }

  if (revenue > 50000) {
    score += 10
  }

  if (revenue > 100000) {
    score += 15
  }

  /*
  |--------------------------------------------------------------------------
  | Operational Intelligence
  |--------------------------------------------------------------------------
  */

  if (orders > 20) {
    score += 10
  }

  if (activeTables > 10) {
    score += 10
  }

  /*
  |--------------------------------------------------------------------------
  | Cost Intelligence
  |--------------------------------------------------------------------------
  */

  if (foodCost <= 30) {
    score += 15
  }

  if (foodCost > 35) {

    score -= 20

    alerts.push({
      type: 'warning',
      message: 'Food cost exceeded operational threshold',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Inventory Intelligence
  |--------------------------------------------------------------------------
  */

  if (lowStock > 0) {

    score -= lowStock * 2

    alerts.push({
      type: 'warning',
      message: `${lowStock} inventory items are low stock`,
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Kitchen Intelligence
  |--------------------------------------------------------------------------
  */

  if (kitchenTickets > 20) {

    score -= 10

    alerts.push({
      type: 'warning',
      message: 'Kitchen overload detected',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Payroll / Attendance Intelligence
  |--------------------------------------------------------------------------
  */

  if (attendanceIssues > 0) {

    score -= attendanceIssues * 3

    alerts.push({
      type: 'critical',
      message: `${attendanceIssues} attendance issues detected`,
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Approval Intelligence
  |--------------------------------------------------------------------------
  */

  if (pendingApprovals > 10) {

    score -= 10

    alerts.push({
      type: 'warning',
      message: 'Approval bottleneck detected',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | State Intelligence
  |--------------------------------------------------------------------------
  */

  let state = 'GOOD'

  if (score >= base + 40) {
    state = 'EXCELLENT'
  }

  if (score < base) {
    state = 'WARNING'
  }

  if (score < base - 20) {
    state = 'CRITICAL'
  }

  return {
    score: Math.round(score),
    foodCost: Number(foodCost.toFixed(2)),
    state,
    alerts,
  }
}
