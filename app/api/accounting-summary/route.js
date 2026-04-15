export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    const today = new Date().toISOString().slice(0, 10)

    // 🔹 DAILY REPORT (REVENUE / COST / PROFIT)
    const { data: reports, error: reportsError } = await supabase
      .from('daily-reports')
      .select('revenue, cost, profit')
      .eq('date', today)

    if (reportsError) {
      return NextResponse.json({ error: reportsError.message }, { status: 500 })
    }

    // 🔹 EXPENSES
    const { data: expensesData, error: expensesError } = await supabase
      .from('accounting-expenses')
      .select('amount')
      .eq('date', today)

    if (expensesError) {
      return NextResponse.json({ error: expensesError.message }, { status: 500 })
    }

    const revenue = (reports || []).reduce((sum, r) => sum + Number(r.revenue || 0), 0)
    const cost = (reports || []).reduce((sum, r) => sum + Number(r.cost || 0), 0)
    const profit = (reports || []).reduce((sum, r) => sum + Number(r.profit || 0), 0)

    const expenses = (expensesData || []).reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    )

    const netProfit = profit - expenses

    return NextResponse.json({
      revenue,
      cost,
      profit,
      expenses,
      netProfit,
    })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}