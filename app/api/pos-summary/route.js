export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    if (!supabase) {
      return NextResponse.json({ data: {} })
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('pos-sales')
      .select('items')
      .gte('created_at', today.toISOString())

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const summary = {}

    for (const sale of data || []) {
      if (!Array.isArray(sale.items)) continue

      for (const item of sale.items) {
        const name = item.name
        const qty = Number(item.qty || 0)

        if (!summary[name]) {
          summary[name] = 0
        }

        summary[name] += qty
      }
    }

    return NextResponse.json({ data: summary })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}