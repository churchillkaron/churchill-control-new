import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getExecutiveSummary() {

  const [
    payments,
    payables,
    waste,
    tables,
    shifts,
    kitchen,
  ] = await Promise.all([

    supabaseAdmin
      .from('payments')
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

    supabaseAdmin
      .from('pos_shifts')
      .select('*'),

    supabaseAdmin
      .from('order_items')
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

  const outstandingAP =
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

  const occupiedTables =
    (tables.data || [])
      .filter(
        table =>
          table.status ===
          'OCCUPIED'
      ).length

  const activeStaff =
    (shifts.data || [])
      .filter(
        shift =>
          shift.status ===
          'OPEN'
      ).length

  const kitchenQueue =
    (kitchen.data || [])
      .filter(
        item =>
          item.kitchen_status !==
          'READY'
      ).length

  return {

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    outstanding_ap:
      Number(
        outstandingAP.toFixed(2)
      ),

    waste_cost:
      Number(
        wasteCost.toFixed(2)
      ),

    occupied_tables:
      occupiedTables,

    active_staff:
      activeStaff,

    kitchen_queue:
      kitchenQueue,
  }
}
