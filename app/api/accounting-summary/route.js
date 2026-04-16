import { createClient } from '../../../lib/supabase'

export async function GET() {
  const supabase = createClient()

  // =========================
  // POS DATA
  // =========================
  const { data: salesData, error: salesError } = await supabase
    .from('pos-sales')
    .select('*')

  if (salesError) {
    console.error('POS fetch error:', salesError)
  }

  const revenue = (salesData || []).reduce(
    (sum, s) => sum + Number(s.total || 0),
    0
  )

  const sales = (salesData || []).length

  const avgTicket = sales > 0 ? Math.round(revenue / sales) : 0

  const drinksTotal = (salesData || []).reduce(
    (sum, s) => sum + Number(s.drinks || 0),
    0
  )

  const drinksPerSale =
    sales > 0 ? Number((drinksTotal / sales).toFixed(2)) : 0

  // =========================
  // EXPENSE DATA
  // =========================
  const { data: expenseData, error: expenseError } = await supabase
    .from('accounting-expenses')
    .select('*')

  if (expenseError) {
    console.error('Expense fetch error:', expenseError)
  }

  const cost = (expenseData || []).reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  )

  const profit = revenue - cost

  const margin =
    revenue > 0 ? Math.round((profit / revenue) * 100) : 0

  // =========================
  // AI ENGINE (STABLE BASE)
  // =========================
  let score = 100
  const issues = []
  const commands = []

  if (avgTicket < 500) {
    score -= 20
    issues.push('Low ticket size')
    commands.push('FOH: upsell mains and sides')
  }

  if (drinksPerSale < 1) {
    score -= 20
    issues.push('Drinks per sale too low')
    commands.push('Bar: push drinks')
  }

  if (margin < 60) {
    score -= 20
    issues.push('Margin too low')
    commands.push('Manager: control costs')
  }

  let status = 'GOOD'
  if (score < 80) status = 'WARNING'
  if (score < 60) status = 'BAD'
  if (score < 40) status = 'CRITICAL'

  const ai = {
    score,
    status,
    issues,
    commands
  }

  // =========================
  // SERVICE CHARGE ENGINE
  // =========================
  const baseServiceCharge = revenue * 0.05

  let multiplier = 1
  if (status === 'WARNING') multiplier = 0.7
  if (status === 'BAD') multiplier = 0.4
  if (status === 'CRITICAL') multiplier = 0

  const finalServiceCharge = baseServiceCharge * multiplier

  const foh = Math.round(finalServiceCharge * 0.5)
  const bar = Math.round(finalServiceCharge * 0.3)
  const kitchen = Math.round(finalServiceCharge * 0.2)

  const serviceChargeStatus =
    multiplier === 1
      ? 'FULL'
      : multiplier === 0
      ? 'BLOCKED'
      : 'REDUCED'

  // =========================
  // FINAL RESPONSE
  // =========================
  return Response.json({
    revenue,
    sales,
    avgTicket,
    drinksPerSale,

    cost,
    profit,
    margin,

    ai,

    serviceChargeStatus,
    foh,
    bar,
    kitchen
  })
}