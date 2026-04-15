import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('pos-sales')
      .select('total')

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

    return NextResponse.json({
      revenue,
      sales,
    })

  } catch (err) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    )
  }
}