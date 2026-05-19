export { dynamic } from '@/lib/shared/api/createDynamicRoute'

import { NextResponse } from 'next/server'

import { createClient } from '@supabase/supabase-js'

import {
  validateTenant,
} from '@/lib/shared/api/createDynamicRoute'

import {
  calculateIntelligence,
} from '@/lib/shared/intelligence/intelligenceEngine'

import {
  registerSystemEvents,
} from '@/lib/shared/bootstrap/registerSystemEvents'

registerSystemEvents()

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
      tableResponse,
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

      supabase
        .from('table_sessions')
        .select('*')
        .eq('tenant_id', tenantId),

    ])

    const sales =
      salesResponse.data || []

    const ingredients =
      ingredientResponse.data || []

    const kitchen =
      kitchenResponse.data || []

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

    const intelligence =
      calculateIntelligence({

        revenue,

        cost,

        orders:
          sales.length,

        activeTables:
          tables.filter(
            table =>
              table.status === 'ACTIVE'
          ).length,

        lowStock:
          ingredients.filter(
            ingredient =>
              Number(
                ingredient.quantity || 0
              ) <= 5
          ).length,

        kitchenTickets:
          kitchen.length,

        base: 100,
      })

    return NextResponse.json({

      success: true,

      metrics: {

        revenue,

        cost,

        orders:
          sales.length,

        kitchenTickets:
          kitchen.length,

      },

      intelligence,
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
