import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_fiscal_years'
      )
      .select('*')
      .order(
        'fiscal_year',
        {
          ascending: false,
        }
      )

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      fiscal_years:
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
