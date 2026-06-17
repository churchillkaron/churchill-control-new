import { createServerSupabase } from "@/lib/shared/supabase/server";
export function calculateFinancialHealth({
  revenue = 0,
  cost = 0,
  payroll = 0,
  pendingInvoices = 0,
  cashBalance = 0,
}) {

  const grossProfit =
    revenue - cost

  const netProfit =
    grossProfit - payroll

  const grossMargin =
    revenue > 0
      ? (grossProfit / revenue) * 100
      : 0

  const netMargin =
    revenue > 0
      ? (netProfit / revenue) * 100
      : 0

  let healthScore = 100

  const alerts = []

  /*
  |--------------------------------------------------------------------------
  | Revenue
  |--------------------------------------------------------------------------
  */

  if (revenue <= 0) {

    healthScore -= 40

    alerts.push({
      type: 'critical',
      message: 'No revenue detected',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Gross Margin
  |--------------------------------------------------------------------------
  */

  if (grossMargin >= 70) {
    healthScore += 15
  }

  if (grossMargin < 50) {

    healthScore -= 20

    alerts.push({
      type: 'warning',
      message: 'Gross margin below healthy threshold',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Net Margin
  |--------------------------------------------------------------------------
  */

  if (netMargin < 15) {

    healthScore -= 15

    alerts.push({
      type: 'warning',
      message: 'Net margin is low',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Payroll Pressure
  |--------------------------------------------------------------------------
  */

  if (
    revenue > 0 &&
    payroll / revenue > 0.35
  ) {

    healthScore -= 15

    alerts.push({
      type: 'warning',
      message: 'Payroll ratio is too high',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Pending Invoices
  |--------------------------------------------------------------------------
  */

  if (pendingInvoices > 20) {

    healthScore -= 10

    alerts.push({
      type: 'warning',
      message: 'Large amount of pending invoices',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Cash Position
  |--------------------------------------------------------------------------
  */

  if (cashBalance < 0) {

    healthScore -= 25

    alerts.push({
      type: 'critical',
      message: 'Negative cash position detected',
    })
  }

  /*
  |--------------------------------------------------------------------------
  | State
  |--------------------------------------------------------------------------
  */

  healthScore = Math.max(
    0,
    Math.min(
      100,
      healthScore
    )
  )

  let state = 'GOOD'

  if (healthScore >= 90) {
    state = 'EXCELLENT'
  }

  else if (healthScore >= 75) {
    state = 'GOOD'
  }

  else if (healthScore >= 50) {
    state = 'WARNING'
  }

  else {
    state = 'CRITICAL'
  }

  return {

    state,

    score:
      Math.round(
        healthScore
      ),

    grossProfit,

    netProfit,

    grossMargin:
      Number(
        grossMargin.toFixed(2)
      ),

    netMargin:
      Number(
        netMargin.toFixed(2)
      ),

    alerts,
  }
}
