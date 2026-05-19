import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenEndOfDayReport({
  tenantId,
  reportDate,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const targetDate =
    reportDate ||
    new Date()
      .toISOString()
      .split('T')[0]

  const startOfDay =
    `${targetDate}T00:00:00.000Z`

  const endOfDay =
    `${targetDate}T23:59:59.999Z`

  /*
  |--------------------------------------------------------------------------
  | Load Kitchen Queue
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
      startOfDay
    )
    .lte(
      'created_at',
      endOfDay
    )

  if (queueError) {
    throw new Error(
      queueError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Load Kitchen Tickets
  |--------------------------------------------------------------------------
  */

  const {
    data: kitchenTickets,
    error: ticketError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .gte(
      'created_at',
      startOfDay
    )
    .lte(
      'created_at',
      endOfDay
    )

  if (ticketError) {
    throw new Error(
      ticketError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Core Metrics
  |--------------------------------------------------------------------------
  */

  const totalTickets =
    kitchenTickets?.length || 0

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

  const voidedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'VOIDED'
    ).length || 0

  /*
  |--------------------------------------------------------------------------
  | Timing Metrics
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
  | Station Performance
  |--------------------------------------------------------------------------
  */

  const stationSummary = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const station =
      item.station ||
      'UNASSIGNED'

    if (
      !stationSummary[
        station
      ]
    ) {

      stationSummary[
        station
      ] = {

        total: 0,
        completed: 0,
        served: 0,
        returned: 0,
        rejected: 0,

      }
    }

    stationSummary[
      station
    ].total += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      stationSummary[
        station
      ].completed += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      stationSummary[
        station
      ].served += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      stationSummary[
        station
      ].returned += 1
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      stationSummary[
        station
      ].rejected += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Kitchen Score
  |--------------------------------------------------------------------------
  */

  let kitchenScore = 100

  kitchenScore -=
    returnedItems * 2

  kitchenScore -=
    rejectedItems * 5

  kitchenScore -=
    cancelledItems * 2

  kitchenScore -=
    voidedItems * 3

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
  | Kitchen Rating
  |--------------------------------------------------------------------------
  */

  let kitchenRating =
    'GOOD'

  if (
    kitchenScore >= 95
  ) {

    kitchenRating =
      'ELITE'
  } else if (
    kitchenScore >= 80
  ) {

    kitchenRating =
      'GOOD'
  } else if (
    kitchenScore >= 60
  ) {

    kitchenRating =
      'WARNING'
  } else {

    kitchenRating =
      'CRITICAL'
  }

  /*
  |--------------------------------------------------------------------------
  | Save Daily Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_daily_reports')
    .insert({

      tenant_id:
        tenantId,

      report_date:
        targetDate,

      total_tickets:
        totalTickets,

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

      cancelled_items:
        cancelledItems,

      voided_items:
        voidedItems,

      average_prep_minutes:
        averagePrepMinutes,

      kitchen_score:
        kitchenScore,

      kitchen_rating:
        kitchenRating,

      station_summary:
        stationSummary,

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
        'GENERATE_KITCHEN_END_OF_DAY_REPORT',

      metadata: {

        report_date:
          targetDate,

        kitchen_score:
          kitchenScore,

        kitchen_rating:
          kitchenRating,

        total_items:
          totalItems,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    reportDate:
      targetDate,

    summary: {

      totalTickets,

      totalItems,

      completedItems,

      servedItems,

      returnedItems,

      rejectedItems,

      cancelledItems,

      voidedItems,

      averagePrepMinutes,

      kitchenScore,

      kitchenRating,

    },

    stationSummary,

  }
}
