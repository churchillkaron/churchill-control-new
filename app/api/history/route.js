export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    if (!supabase) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('daily-reports')
      .select('*')
      .order('date', { ascending: false })
      .limit(30)

    if (error) {
      console.error('History API error:', error.message)
      return NextResponse.json([])
    }

    return NextResponse.json(Array.isArray(data) ? data : [])

  } catch (err) {
    console.error('History API crash:', err.message)
    return NextResponse.json([])
  }
}