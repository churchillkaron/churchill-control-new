import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenAIRecommendations({
  tenantId,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  /*
  |--------------------------------------------------------------------------
  | Load Recent Kitchen Activity
  |--------------------------------------------------------------------------
  */

  const last30Days =
    new Date(
      Date.now() -
      30 * 24 * 60 * 60 * 1000
    ).toISOString()

  const {
    data: kitchenQueue,
    error,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .gte(
      'created_at',
      last30Days
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Metrics
  |--------------------------------------------------------------------------
  */

  const totalItems =
    kitchenQueue?.length || 0

  const returnedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'RETURNED'
    ).length || 0

  const rejectedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'REJECTED'
    ).length || 0

  const urgentItems =
    kitchenQueue?.filter(
      item =>
        item.priority ===
        'URGENT'
    ).length || 0

  /*
  |--------------------------------------------------------------------------
  | Prep Time Analysis
  |--------------------------------------------------------------------------
  */

  let prepTotal = 0
  let prepCount = 0

  for (
    const item of
    kitchenQueue || []
  ) {

    if (
      item.started_at &&
      item.completed_at
    ) {

      const prepMinutes =
        (
          new Date(
            item.completed_at
          ) -
          new Date(
            item.started_at
          )
        ) / 1000 / 60

      prepTotal +=
        prepMinutes

      prepCount++
    }
  }

  const averagePrepMinutes =
    prepCount > 0
      ? Number(
          (
            prepTotal /
            prepCount
          ).toFixed(2)
        )
      : 0

  /*
  |--------------------------------------------------------------------------
  | Recommendation Engine
  |--------------------------------------------------------------------------
  */

  const recommendations = []

  /*
  |--------------------------------------------------------------------------
  | High Returns
  |--------------------------------------------------------------------------
  */

  const returnRate =
    totalItems > 0
      ? (
          returnedItems /
          totalItems
        ) * 100
      : 0

  if (
    returnRate > 5
  ) {

    recommendations.push({

      priority:
        'HIGH',

      type:
        'QUALITY_CONTROL',

      title:
        'High Return Rate Detected',

      message:
        'Kitchen return rate exceeds operational target. Review plating consistency, food temperature, and quality control procedures.',

      impact:
        'Reduces guest complaints and improves kitchen score.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | High Rejections
  |--------------------------------------------------------------------------
  */

  const rejectionRate =
    totalItems > 0
      ? (
          rejectedItems /
          totalItems
        ) * 100
      : 0

  if (
    rejectionRate > 3
  ) {

    recommendations.push({

      priority:
        'CRITICAL',

      type:
        'TRAINING',

      title:
        'Chef Rejection Risk',

      message:
        'Rejected dishes exceed safe operational thresholds. Conduct immediate chef review and retraining.',

      impact:
        'Prevents service charge reduction and payroll penalties.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Slow Kitchen
  |--------------------------------------------------------------------------
  */

  if (
    averagePrepMinutes > 20
  ) {

    recommendations.push({

      priority:
        'HIGH',

      type:
        'SPEED',

      title:
        'Slow Kitchen Performance',

      message:
        'Average preparation time exceeds 20 minutes. Optimize station distribution and prep workflow.',

      impact:
        'Improves service speed and customer satisfaction.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Urgent Overload
  |--------------------------------------------------------------------------
  */

  if (
    urgentItems > 20
  ) {

    recommendations.push({

      priority:
        'MEDIUM',

      type:
        'WORKFLOW',

      title:
        'High Urgent Ticket Volume',

      message:
        'Kitchen receives excessive urgent tickets. Review order pacing and service communication.',

      impact:
        'Reduces kitchen stress and ticket bottlenecks.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Positive Recommendation
  |--------------------------------------------------------------------------
  */

  if (
    recommendations.length === 0
  ) {

    recommendations.push({

      priority:
        'POSITIVE',

      type:
        'PERFORMANCE',

      title:
        'Kitchen Performing Well',

      message:
        'Kitchen operations are stable with no critical performance risks detected.',

      impact:
        'Maintain current standards and continue operational discipline.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Save Recommendation Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_ai_recommendations')
    .insert({

      tenant_id:
        tenantId,

      recommendations,

      generated_at:
        new Date().toISOString(),

    })

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'kitchen',

      action:
        'GENERATE_KITCHEN_AI_RECOMMENDATIONS',

      metadata: {

        recommendations:
          recommendations.length,

        total_items:
          totalItems,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    metrics: {

      totalItems,

      returnedItems,

      rejectedItems,

      urgentItems,

      averagePrepMinutes,

    },

    recommendations,

  }
}
