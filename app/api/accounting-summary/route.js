export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    if (!supabase) {
      return NextResponse.json({})
    }

    const { data, error } = await supabase
      .from('daily-reports')
      .select('*')

    if (error) {
      console.error('Accounting summary error:', error.message)
      return NextResponse.json({})
    }

    return NextResponse.json(Array.isArray(data) ? data : [])

  } catch (err) {
    console.error('Accounting summary crash:', err.message)
    return NextResponse.json({})
  }
}