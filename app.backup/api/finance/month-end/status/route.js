import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_accounting_periods'
      )
      .select('*')
      .order(
        'year',
        {
          ascending: false,
        }
      )
      .order(
        'month',
        {
          ascending: false,
        }
      )

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      periods:
        data || [],
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
