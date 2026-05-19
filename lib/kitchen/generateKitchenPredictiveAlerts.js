import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenPredictiveAlerts({
  tenantId,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  /*
  |--------------------------------------------------------------------------
  | Load Active Kitchen Queue
  |--------------------------------------------------------------------------
  */

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
    .not(
      'status',
      'in',
      '(COMPLETED,SERVED,BUMPED,VOIDED,CANCELLED)'
    )

  if (error) {
    throw new Error(
      error.message
    )
  }

  const alerts = []

  /*
  |--------------------------------------------------------------------------
  | Delayed Items
  |--------------------------------------------------------------------------
  */

  for (
    const item of
    kitchenQueue || []
  ) {

    const createdAt =
      new Date(
        item.created_at
      )

    const minutesOpen =
      (
        Date.now() -
        createdAt.getTime()
      ) / 1000 / 60

    if (
      minutesOpen > 30
    ) {

      alerts.push({

        priority:
          'CRITICAL',

        type:
          'DELAYED_TICKET',

        kitchenQueueId:
          item.id,

        tableNumber:
          item.table_number,

        dishName:
          item.dish_name,

        minutesOpen:
          Number(
            minutesOpen.toFixed(2)
          ),

        message:
          'Kitchen item delayed beyond operational threshold.',

      })
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Station Overload
  |--------------------------------------------------------------------------
  */

  const stationCounts = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const station =
      item.station ||
      'UNASSIGNED'

    if (
      !stationCounts[
        station
      ]
    ) {

      stationCounts[
        station
      ] = 0
    }

    stationCounts[
      station
    ] += 1
  }

  for (
    const station in
    stationCounts
  ) {

    if (
      stationCounts[
        station
      ] > 15
    ) {

      alerts.push({

        priority:
          'HIGH',

        type:
          'STATION_OVERLOAD',

        station,

        queue:
          stationCounts[
            station
          ],

        message:
          'Station workload exceeds safe operating capacity.',

      })
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Chef Overload
  |--------------------------------------------------------------------------
  */

  const chefCounts = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    if (
      !item.chef_name
    ) {
      continue
    }

    if (
      !chefCounts[
        item.chef_name
      ]
    ) {

      chefCounts[
        item.chef_name
      ] = 0
    }

    chefCounts[
      item.chef_name
    ] += 1
  }

  for (
    const chef in
    chefCounts
  ) {

    if (
      chefCounts[
        chef
      ] > 10
    ) {

      alerts.push({

        priority:
          'HIGH',

        type:
          'CHEF_OVERLOAD',

        chef,

        activeItems:
          chefCounts[
            chef
          ],

        message:
          'Chef workload exceeds recommended threshold.',

      })
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Urgent Ticket Risk
  |--------------------------------------------------------------------------
  */

  const urgentItems =
    kitchenQueue?.filter(
      item =>
        item.priority ===
        'URGENT'
    ) || []

  if (
    urgentItems.length > 8
  ) {

    alerts.push({

      priority:
        'CRITICAL',

      type:
        'URGENT_OVERLOAD',

      urgentItems:
        urgentItems.length,

      message:
        'Urgent ticket volume indicates operational instability.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Healthy Operations
  |--------------------------------------------------------------------------
  */

  if (
    alerts.length === 0
  ) {

    alerts.push({

      priority:
        'POSITIVE',

      type:
        'HEALTHY_OPERATION',

      message:
        'Kitchen operations stable. No predictive operational risks detected.',

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Save Alert Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_predictive_alerts')
    .insert({

      tenant_id:
        tenantId,

      alerts,

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
        'GENERATE_KITCHEN_PREDICTIVE_ALERTS',

      metadata: {

        alerts:
          alerts.length,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    alerts,

  }
}
