export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    // 🔒 SAFETY CHECK
    if (!supabase) {
      return NextResponse.json([])
    }

    const { data, error } = await supabase
      .from('daily-reports')
      .select('*')
      .order('date', { ascending: false })
      .limit(30)

    if (error) {
      console.error('Staff performance error:', error.message)
      return NextResponse.json([])
    }

    // 👉 You can expand logic later
    return NextResponse.json(Array.isArray(data) ? data : [])

  } catch (err) {
    console.error('Staff performance crash:', err.message)
    return NextResponse.json([])
  }
}