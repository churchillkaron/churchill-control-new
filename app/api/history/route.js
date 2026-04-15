export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSupabase } from '../../../lib/supabase'

export async function GET() {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return NextResponse.json([])
    }

    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('daily-reports')
      .select('*')
      .order('date', { ascending: false })
      .limit(30)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(Array.isArray(data) ? data : [])

  } catch (err) {
    return NextResponse.json([])
  }
}