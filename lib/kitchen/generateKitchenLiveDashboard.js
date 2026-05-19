import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenLiveDashboard({
  tenantId,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  /*
  |--------------------------------------------------------------------------
  | Active Kitchen Queue
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
    .not(
      'status',
      'in',
      '(COMPLETED,BUMPED,VOIDED,SERVED,CANCELLED)'
    )
    .order(
      'created_at',
      {
        ascending: true,
      }
    )

  if (queueError) {
    throw new Error(
      queueError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Active Kitchen Tickets
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
    .not(
      'status',
      'in',
      '(COMPLETED,BUMPED,VOIDED,SERVED)'
    )

  if (ticketError) {
    throw new Error(
      ticketError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Live Metrics
  |--------------------------------------------------------------------------
  */

  const activeItems =
    kitchenQueue?.length || 0

  const waitingItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'WAITING'
    ).length || 0

  const preparingItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'PREPARING'
    ).length || 0

  const delayedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'DELAYED'
    ).length || 0

  const holdItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'HOLD'
    ).length || 0

  const urgentItems =
    kitchenQueue?.filter(
      item =>
        item.priority ===
        'URGENT'
    ).length || 0

  /*
  |--------------------------------------------------------------------------
  | Station Load
  |--------------------------------------------------------------------------
  */

  const stationLoad = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const station =
      item.station ||
      'UNASSIGNED'

    if (
      !stationLoad[
        station
      ]
    ) {

      stationLoad[
        station
      ] = {

        total: 0,
        waiting: 0,
        preparing: 0,
        urgent: 0,

      }
    }

    stationLoad[
      station
    ].total += 1

    if (
      item.status ===
      'WAITING'
    ) {

      stationLoad[
        station
      ].waiting += 1
    }

    if (
      item.status ===
      'PREPARING'
    ) {

      stationLoad[
        station
      ].preparing += 1
    }

    if (
      item.priority ===
      'URGENT'
    ) {

      stationLoad[
        station
      ].urgent += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Chef Workload
  |--------------------------------------------------------------------------
  */

  const chefWorkload = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const chef =
      item.chef_name ||
      'UNASSIGNED'

    if (
      !chefWorkload[chef]
    ) {

      chefWorkload[chef] = {

        total: 0,
        urgent: 0,
        preparing: 0,

      }
    }

    chefWorkload[
      chef
    ].total += 1

    if (
      item.priority ===
      'URGENT'
    ) {

      chefWorkload[
        chef
      ].urgent += 1
    }

    if (
      item.status ===
      'PREPARING'
    ) {

      chefWorkload[
        chef
      ].preparing += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Oldest Ticket
  |--------------------------------------------------------------------------
  */

  let oldestTicket = null

  if (
    kitchenQueue &&
    kitchenQueue.length > 0
  ) {

    oldestTicket =
      kitchenQueue[0]
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
        'GENERATE_KITCHEN_LIVE_DASHBOARD',

      metadata: {

        active_items:
          activeItems,

        waiting_items:
          waitingItems,

        preparing_items:
          preparingItems,

        urgent_items:
          urgentItems,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    summary: {

      activeTickets:
        kitchenTickets?.length || 0,

      activeItems,

      waitingItems,

      preparingItems,

      delayedItems,

      holdItems,

      urgentItems,

    },

    oldestTicket,

    stationLoad,

    chefWorkload,

    kitchenQueue,

  }
}
