import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getLiveOperations() {

  const [
    payments,
    orders,
    kitchen,
    shifts,
    tables,
  ] = await Promise.all([

    supabaseAdmin
      .from('payments')
      .select('*'),

    supabaseAdmin
      .from('orders')
      .select('*'),

    supabaseAdmin
      .from('order_items')
      .select('*'),

    supabaseAdmin
      .from('pos_shifts')
      .select('*'),

    supabaseAdmin
      .from(
        'restaurant_tables'
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

  const activeKitchen =
    (kitchen.data || [])
      .filter(
        item =>
          item.kitchen_status !==
          'READY'
      )

  const activeStaff =
    (shifts.data || [])
      .filter(
        shift =>
          shift.status ===
          'OPEN'
      )

  const occupiedTables =
    (tables.data || [])
      .filter(
        table =>
          table.status ===
          'OCCUPIED'
      )

  return {

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    live_orders:
      (orders.data || [])
        .length,

    kitchen_queue:
      activeKitchen.length,

    active_staff:
      activeStaff.length,

    occupied_tables:
      occupiedTables.length,

    kitchen_items:
      activeKitchen,
  }
}
