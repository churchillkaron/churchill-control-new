import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { calculateDepreciation } from '@/lib/finance/fixedAssets/calculateDepreciation'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'finance_fixed_assets'
      )
      .select('*')

    if (error) {
      throw error
    }

    const depreciation =
      calculateDepreciation({
        assets:
          data || [],
      })

    return NextResponse.json({
      success: true,
      depreciation,
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
