import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenShiftSummary({
  tenantId,
  shiftName = 'DAY',
  startDate,
  endDate,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const fromDate =
    startDate ||
    new Date(
      Date.now() -
      12 * 60 * 60 * 1000
    ).toISOString()

  const toDate =
    endDate ||
    new Date().toISOString()

  /*
  |--------------------------------------------------------------------------
  | Load Shift Kitchen Queue
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
      fromDate
    )
    .lte(
      'created_at',
      toDate
    )

  if (queueError) {
    throw new Error(
      queueError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Summary Metrics
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

  const cancelledItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'CANCELLED'
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
  | Chef Productivity
  |--------------------------------------------------------------------------
  */

  const chefSummary = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const chef =
      item.chef_name ||
      'UNASSIGNED'

    if (
      !chefSummary[chef]
    ) {

      chefSummary[chef] = {

        total: 0,
        completed: 0,
        served: 0,
        returned: 0,
        rejected: 0,

      }
    }

    chefSummary[
      chef
    ].total += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      chefSummary[
        chef
      ].completed += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      chefSummary[
        chef
      ].served += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      chefSummary[
        chef
      ].returned += 1
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chefSummary[
        chef
      ].rejected += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Shift Score
  |--------------------------------------------------------------------------
  */

  let shiftScore = 100

  shiftScore -=
    returnedItems * 2

  shiftScore -=
    rejectedItems * 5

  shiftScore -=
    cancelledItems * 2

  if (
    averagePrepMinutes > 20
  ) {

    shiftScore -= 10
  }

  if (
    shiftScore < 0
  ) {

    shiftScore = 0
  }

  /*
  |--------------------------------------------------------------------------
  | Shift Level
  |--------------------------------------------------------------------------
  */

  let shiftLevel =
    'GOOD'

  if (
    shiftScore >= 95
  ) {

    shiftLevel =
      'ELITE'
  } else if (
    shiftScore >= 80
  ) {

    shiftLevel =
      'GOOD'
  } else if (
    shiftScore >= 60
  ) {

    shiftLevel =
      'WARNING'
  } else {

    shiftLevel =
      'CRITICAL'
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
        'GENERATE_KITCHEN_SHIFT_SUMMARY',

      metadata: {

        shift_name:
          shiftName,

        total_items:
          totalItems,

        shift_score:
          shiftScore,

        shift_level:
          shiftLevel,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    shiftName,

    reportPeriod: {

      startDate:
        fromDate,

      endDate:
        toDate,

    },

    summary: {

      totalItems,

      completedItems,

      servedItems,

      returnedItems,

      rejectedItems,

      cancelledItems,

      urgentItems,

      averagePrepMinutes,

      shiftScore,

      shiftLevel,

    },

    chefSummary,

  }
}
