import { createClient } from '@supabase/supabase-js'

export async function GET() {

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  // =========================
  // GET SALES DATA
  // =========================
  const { data: salesData } = await supabase
    .from('pos-sales')
    .select('*')

  const roles = {
    FOH: [],
    BAR: [],
    KITCHEN: []
  }

  let revenue = 0

  ;(salesData || []).forEach(sale => {

    revenue += Number(sale.total || 0)

    const name = sale.staff || 'Unknown'
    const role = sale.role || 'FOH'

    if (!roles[role]) roles[role] = []

    if (!roles[role].includes(name)) {
      roles[role].push(name)
    }
  })

  // =========================
  // SERVICE CHARGE CALCULATION
  // =========================
  const baseServiceCharge = revenue * 0.05

  const fohTotal = baseServiceCharge * 0.5
  const barTotal = baseServiceCharge * 0.3
  const kitchenTotal = baseServiceCharge * 0.2

  const split = (total, people) => {
    if (!people.length) return []

    const share = Math.round(total / people.length)

    return people.map(name => ({
      name,
      payout: share
    }))
  }

  // =========================
  // RESPONSE
  // =========================
  return Response.json({
    FOH: split(fohTotal, roles.FOH),
    BAR: split(barTotal, roles.BAR),
    KITCHEN: split(kitchenTotal, roles.KITCHEN)
  })
}