import {
  calculateKPIs,
} from '@/lib/shared/kpi/kpiEngine'

import {
  getServiceSupabase,
} from '@/lib/shared/supabase/service'

export async function kpiHandler(payload) {

  const {
    tenantId,
    orderId,
    finance,
  } = payload

  if (!tenantId || !orderId) {

    throw new Error(
      'kpiHandler requires tenantId and orderId'
    )

  }

  const supabase =
    getServiceSupabase()

  const revenue =
    Number(finance?.revenue || 0)

  const cogs =
    Number(finance?.cogs || 0)

  const foodCost =
    revenue > 0
      ? (cogs / revenue) * 100
      : 0

  const kpis =
    calculateKPIs({

      revenue,

      orders: 1,

      tables: 1,

      laborCost:
        revenue * 0.22,

      foodCost,

      refunds: 0,

    })

  const record = {

    tenant_id:
      tenantId,

    source:
      'ORDER_COMPLETED',

    source_id:
      orderId,

    revenue,

    cogs,

    food_cost:
      foodCost,

    avg_order_value:
      kpis.avgOrderValue,

    revenue_per_table:
      kpis.revenuePerTable,

    labor_ratio:
      kpis.laborRatio,

    refund_ratio:
      kpis.refundRatio,

    operational_score:
      kpis.operationalScore,

    state:
      kpis.state,

    created_at:
      new Date().toISOString(),

  }

  const { error } =
    await supabase

      .from(
        'operational_kpi_snapshots'
      )

      .insert(record)

  if (error) {
    throw new Error(error.message)
  }

  return {

    success: true,

    kpis,

  }

}
