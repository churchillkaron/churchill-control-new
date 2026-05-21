export const dynamic = 'force-dynamic'

import { NextResponse }
from 'next/server'

import {
  generateForecast,
} from '@/lib/shared/forecasting/forecastEngine'

import {
  createServerSupabase,
} from '@/lib/shared/supabase/server'

export async function GET(req) {

  try {

    const supabase =
      createServerSupabase()

    const tenantId =
      req.nextUrl.searchParams.get(
        'tenantId'
      )

    if (!tenantId) {

      return NextResponse.json(

        {
          error:
            'tenantId required',
        },

        {
          status: 400,
        }

      )

    }

    const {
      data: sales,
    } = await supabase

      .from('daily_sales_items')

      .select('*')

      .eq(
        'tenant_id',
        tenantId
      )

    const grouped = {}

    ;(sales || []).forEach(
      row => {

        const day =
          row.batch_id || 'unknown'

        if (!grouped[day]) {

          grouped[day] = {

            revenue: 0,

            cost: 0,

          }

        }

        grouped[day].revenue +=

          (
            Number(row.price || 0) *
            Number(row.quantity || 1)
          )

        grouped[day].cost +=
          Number(row.cost || 0)

      }
    )

    const revenueHistory =
      Object.values(grouped)
        .map(
          day => day.revenue
        )

    const costHistory =
      Object.values(grouped)
        .map(
          day => day.cost
        )

    const payrollHistory =
      revenueHistory.map(

        revenue =>
          revenue * 0.18

      )

    const forecast =
      generateForecast({

        revenueHistory,

        costHistory,

        payrollHistory,

      })

    return NextResponse.json({

      success: true,

      forecast,

    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(

      {
        error:
          'Internal server error',
      },

      {
        status: 500,
      }

    )

  }

}
