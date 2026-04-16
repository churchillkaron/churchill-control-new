import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    )

    const { data, error } = await supabase
      .from('pos-sales')
      .select('*')

    if (error) throw error

    let revenue = 0
    let sales = 0
    let drinks = 0

    const staffMap = {}

    data.forEach(row => {
      revenue += row.total || 0
      sales += 1

      const items = Array.isArray(row.items) ? row.items : []

      items.forEach(item => {
        const qty = item.quantity || 1
        const staff = item.staff || 'UNKNOWN'

        if (!staffMap[staff]) {
          staffMap[staff] = {
            revenue: 0,
            sales: 0,
            drinks: 0
          }
        }

        staffMap[staff].sales += 1
        staffMap[staff].revenue += item.price
          ? item.price * qty
          : 0

        if (item.category === 'drink') {
          drinks += qty
          staffMap[staff].drinks += qty
        }
      })
    })

    const avg = sales > 0 ? revenue / sales : 0

    // =========================
    // GLOBAL SCORING
    // =========================

    let score = 100
    if (avg < 400) score -= 25
    if (drinks < 120) score -= 25
    if (drinks < 80) score -= 30

    let status = 'GOOD'
    if (score < 80) status = 'WARNING'
    if (score < 60) status = 'BAD'
    if (score < 40) status = 'CRITICAL'

    const issues = []
    if (avg < 400) issues.push('Low ticket size — upsell failure')
    if (drinks < 120) issues.push('Drinks-first weak — push drinks immediately')
    if (drinks < 80) issues.push('Critical: drink conversion failing')

    const baseService = revenue * 0.05

    let multiplier = 1
    if (status === 'WARNING') multiplier = 0.7
    if (status === 'BAD') multiplier = 0.4
    if (status === 'CRITICAL') multiplier = 0

    const serviceCharge = baseService * multiplier

    const split = {
      foh: serviceCharge * 0.5,
      bar: serviceCharge * 0.3,
      kitchen: serviceCharge * 0.2
    }

    let decision = 'Full service charge active'
    if (status === 'WARNING') decision = 'Reduced service charge'
    if (status === 'BAD') decision = 'Severely reduced service charge'
    if (status === 'CRITICAL') decision = 'No service charge'

    // =========================
    // COMMAND ENGINE
    // =========================

    const commands = []

    if (status === 'CRITICAL') {
      commands.push('SERVICE CHARGE: BLOCKED')
      commands.push('MANAGER: intervene immediately')
    }

    if (status === 'BAD') {
      commands.push('MANAGER: monitor floor')
      commands.push('FOH: increase upsell')
    }

    if (status === 'WARNING') {
      commands.push('FOH: push drinks first')
    }

    if (avg < 400) {
      commands.push('FOH: upsell mains and sides')
    }

    if (drinks < 120) {
      commands.push('FOH: drinks first — enforce immediately')
    }

    if (drinks < 80) {
      commands.push('BAR: push high-margin drinks aggressively')
    }

    // =========================
    // STAFF PERFORMANCE
    // =========================

    const staff = Object.keys(staffMap).map(name => {
      const s = staffMap[name]

      const avgTicket = s.sales > 0 ? s.revenue / s.sales : 0

      let staffScore = 100
      if (avgTicket < 400) staffScore -= 25
      if (s.drinks < 20) staffScore -= 25

      let staffStatus = 'GOOD'
      if (staffScore < 80) staffStatus = 'WARNING'
      if (staffScore < 60) staffStatus = 'BAD'
      if (staffScore < 40) staffStatus = 'CRITICAL'

      const staffCommands = []

      if (avgTicket < 400) {
        staffCommands.push('Upsell more per table')
      }

      if (s.drinks < 20) {
        staffCommands.push('Push drinks first')
      }

      if (staffStatus === 'CRITICAL') {
        staffCommands.push('Manager review required')
      }

      return {
        name,
        revenue: s.revenue,
        sales: s.sales,
        drinks: s.drinks,
        avgTicket,
        score: staffScore,
        status: staffStatus,
        commands: staffCommands
      }
    })

    return NextResponse.json({
      revenue,
      sales,
      avg,
      drinks,
      ai: {
        score,
        status,
        issues,
        decision,
        serviceCharge,
        split,
        commands
      },
      staff
    })
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}