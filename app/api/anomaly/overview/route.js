export { dynamic } from '@/lib/shared/api/createDynamicRoute'

import { NextResponse } from 'next/server'

import { createClient } from '@supabase/supabase-js'

import {
  validateTenant,
} from '@/lib/shared/api/createDynamicRoute'

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

    const {
      data: sales,
    } = await supabase
      .from('daily_sales_items')
      .select('*')
      .eq('tenant_id', tenantId)

    const revenue =
      (sales || []).reduce(
        (sum, row) =>
          sum +
          (
            Number(row.price || 0) *
            Number(row.quantity || 1)
          ),
        0
      )

    const cost =
      (sales || []).reduce(
        (sum, row) =>
          sum +
          Number(row.cost || 0),
        0
      )

    const foodCost =
      revenue > 0
        ? (cost / revenue) * 100
        : 0

    const grouped =
      {}

    ;(sales || []).forEach(
      row => {

        const batch =
          row.batch_id || 'unknown'

        if (!grouped[batch]) {

          grouped[batch] = {
            revenue: 0,
            cost: 0,
          }
        }

        grouped[batch].revenue +=
          (
            Number(row.price || 0) *
            Number(row.quantity || 1)
          )

        grouped[batch].cost +=
          Number(row.cost || 0)
      }
    )

    const revenues =
      Object.values(grouped)
        .map(
          day => day.revenue
        )

    const foodCosts =
      Object.values(grouped)
        .map(
          day =>
            day.revenue > 0
              ? (
                  day.cost /
                  day.revenue
                ) * 100
              : 0
        )

    const averageRevenue =
      revenues.length
        ? (
            revenues.reduce(
              (a, b) => a + b,
              0
            ) / revenues.length
          )
        : 0

    const averageFoodCost =
      foodCosts.length
        ? (
            foodCosts.reduce(
              (a, b) => a + b,
              0
            ) / foodCosts.length
          )
        : 0

    const anomalies =
      detectAnomalies({

        revenue,

        averageRevenue,

        foodCost,

        averageFoodCost,

        voids: 2,

        refunds: 1,

        discounts: 5,

      })

    return NextResponse.json({

      success: true,

      metrics: {

        revenue,

        averageRevenue,

        foodCost,

        averageFoodCost,

      },

      anomalies,

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
