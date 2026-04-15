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

    const { data, error } = await supabase
      .from('daily-reports')
      .insert([{ date, dishes, revenue, cost, profit }])
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}