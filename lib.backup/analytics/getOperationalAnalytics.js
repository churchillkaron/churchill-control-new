import { supabaseAdmin } from '@/lib/shared/supabase/admin'

export async function getOperationalAnalytics() {

  const [
    payments,
    orderItems,
    wasteLogs,
    tables,
  ] = await Promise.all([

    supabaseAdmin
      .from('payments')
      .select('*'),

    supabaseAdmin
      .from('order_items')
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

  const totalOrders =
    (orderItems.data || [])
      .length

  const wasteCost =
    (wasteLogs.data || [])
      .reduce(
        (
          sum,
          waste
        ) =>
          sum +
          Number(
            waste.estimated_cost || 0
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

  const averageOrderValue =
    totalOrders > 0
      ? revenue /
        totalOrders
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
        averageOrderValue.toFixed(2)
      ),

    waste_cost:
      Number(
        wasteCost.toFixed(2)
      ),

    occupied_tables:
      occupiedTables,
  }
}
