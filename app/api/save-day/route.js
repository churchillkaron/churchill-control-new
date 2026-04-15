export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function POST(req) {
  try {
    const supabase = getSupabase()
    const body = await req.json()

    const date = body.date || new Date().toISOString().split('T')[0]
    const dishes = body.dishes || ''
    const revenue = Number(body.revenue || 0)
    const cost = Number(body.cost || 0)
    const profit = Number(body.profit || 0)

    // 🔥 CHECK IF DATE EXISTS
    const { data: existing, error: fetchError } = await supabase
      .from('daily-reports')
      .select('id')
      .eq('date', date)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    let result

    if (existing) {
      // 🔥 UPDATE EXISTING DAY
      const { data, error } = await supabase
        .from('daily-reports')
        .update({
          dishes,
          revenue,
          cost,
          profit,
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      result = { mode: 'updated', data }

    } else {
      // 🔥 INSERT NEW DAY
      const { data, error } = await supabase
        .from('daily-reports')
        .insert([{ date, dishes, revenue, cost, profit }])
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      result = { mode: 'inserted', data }
    }

    return NextResponse.json(result)

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}