export { dynamic } from '@/lib/shared/api/createDynamicRoute'

import { NextResponse } from 'next/server'

import { createClient } from '@supabase/supabase-js'

import {
  validateTenant,
} from '@/lib/shared/api/createDynamicRoute'

import {
  generateRecommendations,
} from '@/lib/shared/recommendations/recommendationEngine'

import {
  detectAnomalies,
} from '@/lib/shared/anomaly/anomalyEngine'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function GET(req) {

  try {

    const validation =
      validateTenant(req)

    if (validation.error) {
      return validation.error
    }

    const {
      tenantId,
    } = validation

    const [
      salesResponse,
      ingredientResponse,
      kitchenResponse,
    ] = await Promise.all([

      supabase
        .from('daily_sales_items')
        .select('*')
        .eq('tenant_id', tenantId),

      supabase
        .from('ingredients')
        .select('*')
        .eq('tenant_id', tenantId),

      supabase
        .from('kitchen_tickets')
        .select('*')
        .eq('tenant_id', tenantId),

    ])

    const sales =
      salesResponse.data || []

    const ingredients =
      ingredientResponse.data || []

    const kitchen =
      kitchenResponse.data || []

    const revenue =
      sales.reduce(
        (sum, row) =>
          sum +
          (
            Number(row.price || 0) *
            Number(row.quantity || 1)
          ),
        0
      )

    const cost =
      sales.reduce(
        (sum, row) =>
          sum +
          Number(row.cost || 0),
        0
      )

    const foodCost =
      revenue > 0
        ? (cost / revenue) * 100
        : 0

    const lowStock =
      ingredients.filter(
        ingredient =>
          Number(
            ingredient.quantity || 0
          ) <= 5
      ).length

    const kitchenLoad =
      kitchen.length

    const payrollRatio =
      0.22

    const anomalies =
      detectAnomalies({

        revenue,

        averageRevenue:
          revenue * 1.1,

        foodCost,

        averageFoodCost:
          30,

        voids: 2,

        refunds: 1,

        discounts: 5,

      })

    const recommendations =
      generateRecommendations({

        revenue,

        foodCost,

        lowStock,

        kitchenLoad,

        payrollRatio,

        anomalies,

      })

    return NextResponse.json({

      success: true,

      recommendations,

    })

  } catch (error) {

    console.error(error)

    return NextResponse.json(
      {
        error: 'Internal server error',
      },
      {
        status: 500,
      }
    )
  }
}
