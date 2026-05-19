import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getSystemHealth() {

  const [
    orders,
    kitchen,
    tables,
    ingredients,
    payables,
    audits,
  ] = await Promise.all([

    supabaseAdmin
      .from('orders')
      .select('*'),

    supabaseAdmin
      .from('order_items')
      .select('*'),

    supabaseAdmin
      .from(
        'restaurant_tables'
      )
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
        'finance_audit_logs'
      )
      .select('*'),
  ])

  const delayedKitchen =
    (kitchen.data || [])
      .filter(
        item =>
          item.kitchen_status !==
          'READY'
      ).length

  const occupiedTables =
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

  const unpaidAP =
    (payables.data || [])
      .filter(
        payable =>
          payable.status !==
          'PAID'
      ).length

  return {

    live_orders:
      (orders.data || [])
        .length,

    kitchen_alerts:
      delayedKitchen,

    occupied_tables:
      occupiedTables,

    low_stock_alerts:
      lowStock,

    unpaid_ap:
      unpaidAP,

    audit_events:
      (audits.data || [])
        .length,

    system_status:
      'OPERATIONAL',
  }
}
