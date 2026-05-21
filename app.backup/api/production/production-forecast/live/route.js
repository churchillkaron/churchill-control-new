import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildHourlySales } from '@/lib/pos/analytics/buildHourlySales'

import { buildProductionForecast } from '@/lib/production/forecast/buildProductionForecast'

export async function GET() {

  try {

    const {
      data: payments,
    } = await supabaseAdmin
      .from('payments')
      .select('*')

    const {
      data: ingredients,
    } = await supabaseAdmin
      .from('ingredients')
      .select('*')

    const hourlySales =
      buildHourlySales(
        payments || []
      )

    const forecast =
      buildProductionForecast({
        hourly_sales:
          hourlySales,

        current_stock:
          ingredients || [],
      })

    return NextResponse.json({
      success: true,
      forecast,
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
