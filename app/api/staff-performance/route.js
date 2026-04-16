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

  const staffMap = {}

  ;(salesData || []).forEach(sale => {
    const name = sale.staff || 'Unknown'

    if (!staffMap[name]) {
      staffMap[name] = {
        name,
        revenue: 0,
        orders: 0
      }
    }

    staffMap[name].revenue += Number(sale.total || 0)
    staffMap[name].orders += 1
  })

  // =========================
  // CALCULATE PERFORMANCE
  // =========================
  const result = Object.values(staffMap).map(staff => {
    const avgTicket =
      staff.orders > 0
        ? Math.round(staff.revenue / staff.orders)
        : 0

    let status = 'GOOD'

    if (avgTicket < 600) status = 'WARNING'
    if (avgTicket < 400) status = 'BAD'

    return {
      name: staff.name,
      revenue: staff.revenue,
      orders: staff.orders,
      avgTicket,
      status
    }
  })

  return Response.json(result)
}