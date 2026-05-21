import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getExecutiveMetrics() {

  const [
    payments,
    orders,
    tables,
    ingredients,
    payables,
    waste,
  ] = await Promise.all([

    supabaseAdmin
      .from('payments')
      .select('*'),

    supabaseAdmin
      .from('orders')
      .select('*'),

    supabaseAdmin
      .from('restaurant_tables')
      .select('*'),

    supabaseAdmin
      .from('ingredients')
      .select('*'),

    supabaseAdmin
      .from(
        'finance_accounts_payable'
      )
      .select('*'),

    supabaseAdmin
      .from(
        'production_waste_logs'
      )
      .select('*'),
  ])

  const revenue =
    (payments.data || [])
      .reduce(
        (
          sum,
          payment
        ) =>
          sum +
          Number(
            payment.total || 0
          ),
        0
      )

  const activeTables =
    (tables.data || [])
      .filter(
        table =>
          table.status ===
          'OCCUPIED'
      ).length

  const lowStock =
    (ingredients.data || [])
      .filter(
        ingredient =>
          Number(
            ingredient.stock || 0
          ) <= Number(
            ingredient.minimum_stock || 0
          )
      ).length

  const pendingPayables =
    (payables.data || [])
      .filter(
        payable =>
          payable.status !==
          'PAID'
      )
      .reduce(
        (
          sum,
          payable
        ) =>
          sum +
          Number(
            payable.amount || 0
          ),
        0
      )

  const wasteCost =
    (waste.data || [])
      .reduce(
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

  return {

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    total_orders:
      (orders.data || [])
        .length,

    active_tables:
      activeTables,

    low_stock_alerts:
      lowStock,

    pending_payables:
      Number(
        pendingPayables.toFixed(2)
      ),

    waste_cost:
      Number(
        wasteCost.toFixed(2)
      ),
  }
}
