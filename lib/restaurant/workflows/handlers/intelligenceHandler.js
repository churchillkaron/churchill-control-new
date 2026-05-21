import {
  calculateIntelligence,
} from '@/lib/shared/intelligence/intelligenceEngine'

import {
  detectAnomalies,
} from '@/lib/shared/anomaly/anomalyEngine'

import {
  generateRecommendations,
} from '@/lib/shared/recommendations/recommendationEngine'

import {
  getServiceSupabase,
} from '@/lib/shared/supabase/service'

export async function intelligenceHandler(payload) {

  const {
    tenantId,
    orderId,
    finance,
    inventory,
    kpi,
  } = payload

  if (!tenantId || !orderId) {

    throw new Error(
      'intelligenceHandler requires tenantId and orderId'
    )

  }

  const supabase =
    getServiceSupabase()

  const revenue =
    Number(finance?.revenue || 0)

  const cost =
    Number(finance?.cogs || 0)

  const foodCost =
    revenue > 0
      ? (cost / revenue) * 100
      : 0

  const lowStock =
    inventory?.movements?.filter(
      m =>
        Number(
          m.quantity || 0
        ) < 0
    ).length || 0

  const intelligence =
    calculateIntelligence({

      revenue,

      cost,

      orders: 1,

      activeTables: 1,

      lowStock,

      kitchenTickets: 1,

      base: 100,

    })

  const anomalies =
    detectAnomalies({

      revenue,

      averageRevenue:
        revenue,

      foodCost,

      averageFoodCost:
        30,

      voids: 0,

      refunds: 0,

      discounts: 0,

    })

  const recommendations =
    generateRecommendations({

      revenue,

      foodCost,

      lowStock,

      kitchenLoad: 1,

      payrollRatio: 0.22,

      anomalies,

    })

  const record = {

    tenant_id:
      tenantId,

    source:
      'ORDER_COMPLETED',

    source_id:
      orderId,

    intelligence_score:
      intelligence.score,

    intelligence_state:
      intelligence.state,

    food_cost:
      intelligence.foodCost,

    alerts:
      intelligence.alerts,

    anomalies,

    recommendations,

    kpi_state:
      kpi?.kpis?.state || null,

    created_at:
      new Date().toISOString(),

  }

  const { error } =
    await supabase

      .from(
        'intelligence_snapshots'
      )

      .insert(record)

  if (error) {
    throw new Error(error.message)
  }

  return {

    success: true,

    intelligence,

    anomalies,

    recommendations,

  }

}
