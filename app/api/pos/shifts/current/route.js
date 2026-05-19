import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url)

    const terminal_id =
      searchParams.get(
        'terminal_id'
      )

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_shifts')
      .select('*')
      .eq('terminal_id', terminal_id)
      .eq('status', 'OPEN')
      .order(
        'created_at',
        {
          ascending: false,
        }
      )
      .limit(1)
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      data,
    })

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    )
  }
}
