import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getManagementOverview() {

  const [
    shifts,
    orders,
    kitchen,
    payables,
    waste,
    tables,
  ] = await Promise.all([

    supabaseAdmin
      .from('pos_shifts')
      .select('*'),

    supabaseAdmin
      .from('orders')
      .select('*'),

    supabaseAdmin
      .from('order_items')
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

    supabaseAdmin
      .from(
        'restaurant_tables'
      )
      .select('*'),
  ])

  const activeShifts =
    (shifts.data || [])
      .filter(
        shift =>
          shift.status ===
          'OPEN'
      ).length

  const activeKitchen =
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

  const unpaidAP =
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

    active_shifts:
      activeShifts,

    active_orders:
      (orders.data || [])
        .length,

    kitchen_queue:
      activeKitchen,

    occupied_tables:
      occupiedTables,

    unpaid_ap:
      Number(
        unpaidAP.toFixed(2)
      ),

    waste_cost:
      Number(
        wasteCost.toFixed(2)
      ),
  }
}
