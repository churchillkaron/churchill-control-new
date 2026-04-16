import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  // =========================
  // GET SALES
  // =========================
  const { data: salesData } = await supabase
    .from('pos-sales')
    .select('*')

  // =========================
  // GROUP STAFF BY ROLE
  // =========================
  const roles = {
    FOH: [],
    BAR: [],
    KITCHEN: []
  }

  ;(salesData || []).forEach(sale => {
    const name = sale.staff || 'Unknown'
    const role = sale.role || 'FOH' // fallback

    if (!roles[role]) roles[role] = []

    if (!roles[role].includes(name)) {
      roles[role].push(name)
    }
  })

  // =========================
  // GET SERVICE CHARGE
  // =========================
  const { data: summary } = await fetch(
    process.env.NEXT_PUBLIC_BASE_URL + '/api/accounting-summary'
  ).then(res => res.json())

  const fohTotal = summary.foh || 0
  const barTotal = summary.bar || 0
  const kitchenTotal = summary.kitchen || 0

  // =========================
  // SPLIT LOGIC
  // =========================
  const split = (total, people) => {
    if (!people.length) return []
    const share = Math.round(total / people.length)

    return people.map(name => ({
      name,
      payout: share
    }))
  }

  return Response.json({
    FOH: split(fohTotal, roles.FOH),
    BAR: split(barTotal, roles.BAR),
    KITCHEN: split(kitchenTotal, roles.KITCHEN)
  })
}