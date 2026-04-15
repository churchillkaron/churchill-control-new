import { NextResponse } from 'next/server'
import supabase from '../../../lib/supabase'

export async function GET() {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data, error } = await supabase
      .from('pos-sales')
      .select('*')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch today sales' },
      { status: 500 }
    )
  }
}