import { supabase } from '@/lib/shared/supabase/client'

export async function calculateKitchenChefPerformance({
  tenantId,
  chefId,
  startDate,
  endDate,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!chefId) {
    throw new Error('chefId required')
  }

  const fromDate =
    startDate ||
    new Date(
      Date.now() -
      7 * 24 * 60 * 60 * 1000
    ).toISOString()

  const toDate =
    endDate ||
    new Date().toISOString()

  /*
  |--------------------------------------------------------------------------
  | Load Chef Queue Items
  |--------------------------------------------------------------------------
  */

  const {
    data: kitchenItems,
    error,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'chef_id',
      chefId
    )
    .gte(
      'created_at',
      fromDate
    )
    .lte(
      'created_at',
      toDate
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  const totalItems =
    kitchenItems?.length || 0

  const completedItems =
    kitchenItems?.filter(
      item =>
        item.status ===
        'COMPLETED'
    ).length || 0

  const servedItems =
    kitchenItems?.filter(
      item =>
        item.status ===
        'SERVED'
    ).length || 0

  const returnedItems =
    kitchenItems?.filter(
      item =>
        item.status ===
        'RETURNED'
    ).length || 0

  const rejectedItems =
    kitchenItems?.filter(
      item =>
        item.status ===
        'REJECTED'
    ).length || 0

  const urgentItems =
    kitchenItems?.filter(
      item =>
        item.priority ===
        'URGENT'
    ).length || 0

  /*
  |--------------------------------------------------------------------------
  | Calculate Timing Metrics
  |--------------------------------------------------------------------------
  */

  let totalPrepTime = 0
  let prepCount = 0

  for (
    const item of
    kitchenItems || []
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

      totalPrepTime +=
        prepMinutes

      prepCount++
    }
  }

  const averagePrepTime =
    prepCount > 0
      ? Number(
          (
            totalPrepTime /
            prepCount
          ).toFixed(2)
        )
      : 0

  /*
  |--------------------------------------------------------------------------
  | Performance Score
  |--------------------------------------------------------------------------
  */

  let score = 100

  score -=
    returnedItems * 5

  score -=
    rejectedItems * 10

  if (
    averagePrepTime > 20
  ) {

    score -= 10
  }

  if (
    urgentItems > 0 &&
    averagePrepTime < 15
  ) {

    score += 5
  }

  if (score < 0) {
    score = 0
  }

  if (score > 100) {
    score = 100
  }

  /*
  |--------------------------------------------------------------------------
  | Performance Level
  |--------------------------------------------------------------------------
  */

  let level = 'GOOD'

  if (score >= 95) {
    level = 'ELITE'
  } else if (score >= 80) {
    level = 'GOOD'
  } else if (score >= 60) {
    level = 'WARNING'
  } else {
    level = 'CRITICAL'
  }

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
        'CALCULATE_CHEF_PERFORMANCE',

      reference_id:
        chefId,

      metadata: {

        chef_id:
          chefId,

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

        average_prep_time:
          averagePrepTime,

        performance_score:
          score,

        performance_level:
          level,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    chefId,

    totalItems,

    completedItems,

    servedItems,

    returnedItems,

    rejectedItems,

    urgentItems,

    averagePrepTime,

    performanceScore:
      score,

    performanceLevel:
      level,

  }
}
