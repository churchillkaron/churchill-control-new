export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/integrations/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('accounting-expenses')
      .select('*')
      .order('date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req) {
  try {
    const supabase = getSupabase()
    const body = await req.json()

    const { error } = await supabase
      .from('accounting-expenses')
      .insert([body])

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}