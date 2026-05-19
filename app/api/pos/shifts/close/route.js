import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function POST(req) {

  try {

    const body =
      await req.json()

    const {
      shift_id,
      closing_cash,
      expected_cash,
    } = body

    const variance =
      Number(closing_cash) -
      Number(expected_cash)

    const {
      data,
      error,
    } = await supabaseAdmin
      .from('pos_shifts')
      .update({
        closing_cash,
        expected_cash,
        variance,
        status: 'CLOSED',
        closed_at:
          new Date()
            .toISOString(),
      })
      .eq('id', shift_id)
      .select()
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
