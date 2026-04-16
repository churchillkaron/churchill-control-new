export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    if (!supabase) {
      return NextResponse.json({
        FOH: [],
        BAR: [],
        KITCHEN: [],
      })
    }

    const { data, error } = await supabase
      .from('daily-reports')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)

    if (error) {
      console.error('Payout error:', error.message)
      return NextResponse.json({
        FOH: [],
        BAR: [],
        KITCHEN: [],
      })
    }

    // placeholder logic (safe)
    return NextResponse.json({
      FOH: [],
      BAR: [],
      KITCHEN: [],
    })

  } catch (err) {
    console.error('Payout crash:', err.message)
    return NextResponse.json({
      FOH: [],
      BAR: [],
      KITCHEN: [],
    })
  }
}