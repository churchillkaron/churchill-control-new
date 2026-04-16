import { createClient } from '@supabase/supabase-js'

export async function GET() {

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  )

  // GET SALES
  const { data: salesData } = await supabase
    .from('pos-sales')
    .select('*')

  // GROUP STAFF BY ROLE
  const roles = {
    FOH: [],
    BAR: [],
    KITCHEN: []
  }

  ;(salesData || []).forEach(sale => {
    const name = sale.staff || 'Unknown'
    const role = sale.role || 'FOH'

    if (!roles[role]) roles[role] = []

    if (!roles[role].includes(name)) {
      roles[role].push(name)
    }
  })

  // GET SERVICE CHARGE DIRECTLY (NO API CALL INSIDE API)
  const revenue = (salesData || []).reduce(
    (sum, s) => sum + Number(s.total || 0),
    0
  )

  const base = revenue * 0.05

  const fohTotal = base * 0.5
  const barTotal = base * 0.3
  const kitchenTotal = base * 0.2

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