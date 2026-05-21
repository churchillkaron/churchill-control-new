import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function GET() {

  try {

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(
        'production_waste_logs'
      )
      .select('*')
      .order(
        'created_at',
        {
          ascending: false,
        }
      )

    if (error) {
      throw error
    }

    const totalWasteCost =
      data.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.estimated_cost || 0
          ),
        0
      )

    return NextResponse.json({
      success: true,
      logs: data,
      totalWasteCost:
        Number(
          totalWasteCost.toFixed(2)
        ),
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
