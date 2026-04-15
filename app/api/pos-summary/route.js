import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  const supabase = getSupabase() {
  try {
    const supabase = getSupabase()

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('pos-sales')
      .select('total')
      .gte('created_at', today.toISOString())

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    const revenue = (data || []).reduce(
      (sum, row) => sum + Number(row.total || 0),
      0
    )

    const sales = (data || []).length
    const avg = sales ? revenue / sales : 0

    return NextResponse.json({
      revenue,
      sales,
      avg,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}