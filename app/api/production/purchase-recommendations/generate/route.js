import { NextResponse } from 'next/server'

import { supabaseAdmin } from '@/lib/shared/supabase/admin'

import { buildPurchaseRecommendations } from '@/lib/production/purchasing/buildPurchaseRecommendations'

export async function GET() {

  try {

    const {
      data: replenishment,
    } = await supabaseAdmin
      .from(
        'production_replenishment_cache'
      )
      .select('*')

    const {
      data: suppliers,
    } = await supabaseAdmin
      .from(
        'ingredient_suppliers'
      )
      .select('*')

    const recommendations =
      buildPurchaseRecommendations({
        replenishment:
          replenishment || [],

        suppliers:
          suppliers || [],
      })

    return NextResponse.json({
      success: true,
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
