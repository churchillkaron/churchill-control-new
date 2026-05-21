import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getPerformanceOverview() {

  const [
    orders,
    payments,
    waste,
    shifts,
  ] = await Promise.all([

    supabaseAdmin
      .from('orders')
      .select('*'),

    supabaseAdmin
      .from('payments')
      .select('*'),

    supabaseAdmin
      .from(
        'production_waste_logs'
      )
      .select('*'),

    supabaseAdmin
      .from('pos_shifts')
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

  const activeStaff =
    (shifts.data || [])
      .filter(
        shift =>
          shift.status ===
          'OPEN'
      ).length

  const totalOrders =
    (orders.data || [])
      .length

  const avgOrderValue =
    totalOrders > 0
      ? revenue /
        totalOrders
      : 0

  const efficiency =
    revenue > 0
      ? (
          (
            revenue -
            wasteCost
          ) / revenue
        ) * 100
      : 0

  return {

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    total_orders:
      totalOrders,

    average_order_value:
      Number(
        avgOrderValue.toFixed(2)
      ),

    waste_cost:
      Number(
        wasteCost.toFixed(2)
      ),

    active_staff:
      activeStaff,

    efficiency:
      Number(
        efficiency.toFixed(2)
      ),
  }
}
