import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenMonthlyPerformance({
  tenantId,
  month,
  year,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const targetMonth =
    month ||
    new Date().getMonth() + 1

  const targetYear =
    year ||
    new Date().getFullYear()

  const startDate =
    new Date(
      targetYear,
      targetMonth - 1,
      1
    ).toISOString()

  const endDate =
    new Date(
      targetYear,
      targetMonth,
      0,
      23,
      59,
      59
    ).toISOString()

  /*
  |--------------------------------------------------------------------------
  | Load Monthly Kitchen Queue
  |--------------------------------------------------------------------------
  */

  const {
    data: kitchenQueue,
    error: queueError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .gte(
      'created_at',
      startDate
    )
    .lte(
      'created_at',
      endDate
    )

  if (queueError) {
    throw new Error(
      queueError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Monthly Metrics
  |--------------------------------------------------------------------------
  */

  const totalItems =
    kitchenQueue?.length || 0

  const completedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'COMPLETED'
    ).length || 0

  const servedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'SERVED'
    ).length || 0

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
  | Monthly Prep Time
  |--------------------------------------------------------------------------
  */

  let totalPrepMinutes = 0
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

      totalPrepMinutes +=
        prepMinutes

      prepCount++
    }
  }

  const averagePrepMinutes =
    prepCount > 0
      ? Number(
          (
            totalPrepMinutes /
            prepCount
          ).toFixed(2)
        )
      : 0

  /*
  |--------------------------------------------------------------------------
  | Chef Monthly Rankings
  |--------------------------------------------------------------------------
  */

  const chefPerformance = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const chef =
      item.chef_name ||
      'UNASSIGNED'

    if (
      !chefPerformance[
        chef
      ]
    ) {

      chefPerformance[
        chef
      ] = {

        total: 0,
        completed: 0,
        served: 0,
        returned: 0,
        rejected: 0,
        score: 100,

      }
    }

    chefPerformance[
      chef
    ].total += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      chefPerformance[
        chef
      ].completed += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      chefPerformance[
        chef
      ].served += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      chefPerformance[
        chef
      ].returned += 1

      chefPerformance[
        chef
      ].score -= 2
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chefPerformance[
        chef
      ].rejected += 1

      chefPerformance[
        chef
      ].score -= 5
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Kitchen Monthly Score
  |--------------------------------------------------------------------------
  */

  let kitchenScore = 100

  kitchenScore -=
    returnedItems * 0.5

  kitchenScore -=
    rejectedItems * 2

  if (
    averagePrepMinutes > 20
  ) {

    kitchenScore -= 10
  }

  if (
    kitchenScore < 0
  ) {

    kitchenScore = 0
  }

  /*
  |--------------------------------------------------------------------------
  | Service Charge Unlock
  |--------------------------------------------------------------------------
  */

  let serviceChargeLevel =
    '5%'

  if (
    kitchenScore >= 95
  ) {

    serviceChargeLevel =
      '7%'
  } else if (
    kitchenScore >= 85
  ) {

    serviceChargeLevel =
      '6%'
  }

  /*
  |--------------------------------------------------------------------------
  | Monthly Rating
  |--------------------------------------------------------------------------
  */

  let monthlyRating =
    'GOOD'

  if (
    kitchenScore >= 95
  ) {

    monthlyRating =
      'ELITE'
  } else if (
    kitchenScore >= 80
  ) {

    monthlyRating =
      'GOOD'
  } else if (
    kitchenScore >= 60
  ) {

    monthlyRating =
      'WARNING'
  } else {

    monthlyRating =
      'CRITICAL'
  }

  /*
  |--------------------------------------------------------------------------
  | Save Monthly Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_monthly_reports')
    .insert({

      tenant_id:
        tenantId,

      report_month:
        targetMonth,

      report_year:
        targetYear,

      total_items:
        totalItems,

      completed_items:
        completedItems,

      served_items:
        servedItems,

      returned_items:
        returnedItems,

      rejected_items:
        rejectedItems,

      urgent_items:
        urgentItems,

      average_prep_minutes:
        averagePrepMinutes,

      kitchen_score:
        kitchenScore,

      monthly_rating:
        monthlyRating,

      service_charge_level:
        serviceChargeLevel,

      chef_performance:
        chefPerformance,

      created_at:
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
        'GENERATE_KITCHEN_MONTHLY_PERFORMANCE',

      metadata: {

        month:
          targetMonth,

        year:
          targetYear,

        kitchen_score:
          kitchenScore,

        monthly_rating:
          monthlyRating,

        service_charge_level:
          serviceChargeLevel,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    month:
      targetMonth,

    year:
      targetYear,

    summary: {

      totalItems,

      completedItems,

      servedItems,

      returnedItems,

      rejectedItems,

      urgentItems,

      averagePrepMinutes,

      kitchenScore,

      monthlyRating,

      serviceChargeLevel,

    },

    chefPerformance,

  }
}
