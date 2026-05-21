import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenOperationalReport({
  tenantId,
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
      24 * 60 * 60 * 1000
    ).toISOString()

  const toDate =
    endDate ||
    new Date().toISOString()

  /*
  |--------------------------------------------------------------------------
  | Kitchen Queue Data
  |--------------------------------------------------------------------------
  */

  const {
    data: kitchenItems,
    error: kitchenError,
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

  if (kitchenError) {
    throw new Error(
      kitchenError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Kitchen Ticket Data
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
      fromDate
    )
    .lte(
      'created_at',
      toDate
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

  const cancelledItems =
    kitchenItems?.filter(
      item =>
        item.status ===
        'CANCELLED'
    ).length || 0

  const voidedTickets =
    kitchenTickets?.filter(
      ticket =>
        ticket.status ===
        'VOIDED'
    ).length || 0

  /*
  |--------------------------------------------------------------------------
  | Timing Metrics
  |--------------------------------------------------------------------------
  */

  let prepTimeTotal = 0
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

      prepTimeTotal +=
        prepMinutes

      prepCount++
    }
  }

  const averagePrepTime =
    prepCount > 0
      ? Number(
          (
            prepTimeTotal /
            prepCount
          ).toFixed(2)
        )
      : 0

  /*
  |--------------------------------------------------------------------------
  | Station Metrics
  |--------------------------------------------------------------------------
  */

  const stationMetrics = {}

  for (
    const item of
    kitchenItems || []
  ) {

    const station =
      item.station || 'UNASSIGNED'

    if (
      !stationMetrics[
        station
      ]
    ) {

      stationMetrics[
        station
      ] = {

        total: 0,
        completed: 0,
        returned: 0,
        rejected: 0,

      }
    }

    stationMetrics[
      station
    ].total += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      stationMetrics[
        station
      ].completed += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      stationMetrics[
        station
      ].returned += 1
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      stationMetrics[
        station
      ].rejected += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Chef Metrics
  |--------------------------------------------------------------------------
  */

  const chefMetrics = {}

  for (
    const item of
    kitchenItems || []
  ) {

    const chef =
      item.chef_name ||
      'UNASSIGNED'

    if (
      !chefMetrics[chef]
    ) {

      chefMetrics[chef] = {

        total: 0,
        completed: 0,
        served: 0,
        returned: 0,
        rejected: 0,

      }
    }

    chefMetrics[
      chef
    ].total += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      chefMetrics[
        chef
      ].completed += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      chefMetrics[
        chef
      ].served += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      chefMetrics[
        chef
      ].returned += 1
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chefMetrics[
        chef
      ].rejected += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Performance Score
  |--------------------------------------------------------------------------
  */

  let kitchenScore = 100

  kitchenScore -=
    returnedItems * 2

  kitchenScore -=
    rejectedItems * 5

  kitchenScore -=
    cancelledItems * 2

  if (
    averagePrepTime > 20
  ) {

    kitchenScore -= 10
  }

  if (
    kitchenScore < 0
  ) {

    kitchenScore = 0
  }

  if (
    kitchenScore > 100
  ) {

    kitchenScore = 100
  }

  /*
  |--------------------------------------------------------------------------
  | Kitchen Level
  |--------------------------------------------------------------------------
  */

  let kitchenLevel =
    'GOOD'

  if (
    kitchenScore >= 95
  ) {

    kitchenLevel =
      'ELITE'
  } else if (
    kitchenScore >= 80
  ) {

    kitchenLevel =
      'GOOD'
  } else if (
    kitchenScore >= 60
  ) {

    kitchenLevel =
      'WARNING'
  } else {

    kitchenLevel =
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
        'GENERATE_KITCHEN_OPERATIONAL_REPORT',

      metadata: {

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

        kitchen_score:
          kitchenScore,

        kitchen_level:
          kitchenLevel,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

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

      voidedTickets,

      averagePrepTime,

      kitchenScore,

      kitchenLevel,

    },

    stationMetrics,

    chefMetrics,

  }
}
