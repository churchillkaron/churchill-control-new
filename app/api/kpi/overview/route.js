export { dynamic }
from '@/lib/shared/api/createDynamicRoute'

import { NextResponse }
from 'next/server'

import {
  validateTenant,
} from '@/lib/shared/api/createDynamicRoute'

import {
  calculateKPIs,
} from '@/lib/intelligence/kpi/kpiEngine'

import {
  createServerSupabase,
} from '@/lib/shared/supabase/server'

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

    const supabase =
      createServerSupabase()

    const [

      salesResponse,

      tableResponse,

    ] = await Promise.all([

      supabase
        .from('daily_sales_items')
        .select('*')
        .eq(
          'tenant_id',
          tenantId
        ),

      supabase
        .from('table_sessions')
        .select('*')
        .eq(
          'tenant_id',
          tenantId
        ),

    ])

    const sales =
      salesResponse.data || []

    const tables =
      tableResponse.data || []

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

    const kpis =
      calculateKPIs({

        revenue,

        orders:
          sales.length,

        tables:

          tables.filter(
            table =>
              table.status === 'ACTIVE'
          ).length,

        laborCost:
          revenue * 0.22,

        foodCost,

        refunds: 2,

      })

    return NextResponse.json({

      success: true,

      metrics: {

        revenue,

        orders:
          sales.length,

        activeTables:

          tables.filter(
            table =>
              table.status === 'ACTIVE'
          ).length,

      },

      kpis,

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
