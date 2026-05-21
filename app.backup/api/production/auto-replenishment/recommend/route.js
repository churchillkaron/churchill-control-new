import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildProductionForecast } from '@/lib/production/forecast/buildProductionForecast'

import { buildHourlySales } from '@/lib/pos/analytics/buildHourlySales'

import { buildReplenishmentRecommendations } from '@/lib/production/replenishment/buildReplenishmentRecommendations'

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

    const recommendations =
      buildReplenishmentRecommendations({
        ingredients:
          ingredients || [],

        forecast,
      })

    return NextResponse.json({
      success: true,
      forecast,
      recommendations,
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
