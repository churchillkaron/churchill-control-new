import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenBurnoutRisk({
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
      90 * 24 * 60 * 60 * 1000
    ).toISOString()

  const toDate =
    endDate ||
    new Date().toISOString()

  /*
  |--------------------------------------------------------------------------
  | Load Kitchen Queue
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

  /*
  |--------------------------------------------------------------------------
  | Burnout Matrix
  |--------------------------------------------------------------------------
  */

  const burnoutMap = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    if (
      !item.chef_id
    ) {
      continue
    }

    if (
      !burnoutMap[
        item.chef_id
      ]
    ) {

      burnoutMap[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        totalItems: 0,

        urgentItems: 0,

        delayedItems: 0,

        rejectedItems: 0,

        returnedItems: 0,

        workloadScore: 0,

        pressureScore: 0,

        burnoutScore: 0,

        burnoutRisk:
          'LOW',

      }
    }

    const chef =
      burnoutMap[
        item.chef_id
      ]

    chef.totalItems += 1
    chef.workloadScore += 0.2

    /*
    |--------------------------------------------------------------------------
    | Urgent Pressure
    |--------------------------------------------------------------------------
    */

    if (
      item.priority ===
      'URGENT'
    ) {

      chef.urgentItems += 1
      chef.pressureScore += 2
    }

    /*
    |--------------------------------------------------------------------------
    | Rejections
    |--------------------------------------------------------------------------
    */

    if (
      item.status ===
      'REJECTED'
    ) {

      chef.rejectedItems += 1
      chef.pressureScore += 4
    }

    /*
    |--------------------------------------------------------------------------
    | Returns
    |--------------------------------------------------------------------------
    */

    if (
      item.status ===
      'RETURNED'
    ) {

      chef.returnedItems += 1
      chef.pressureScore += 2
    }

    /*
    |--------------------------------------------------------------------------
    | Delay Stress
    |--------------------------------------------------------------------------
    */

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

      if (
        prepMinutes > 35
      ) {

        chef.delayedItems += 1
        chef.pressureScore += 3
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Final Burnout Risk
  |--------------------------------------------------------------------------
  */

  const burnoutReport =
    Object.values(
      burnoutMap
    ).map(chef => {

      chef.burnoutScore =
        Number(
          (
            chef.workloadScore +
            chef.pressureScore
          ).toFixed(2)
        )

      if (
        chef.burnoutScore >= 60
      ) {

        chef.burnoutRisk =
          'CRITICAL'

      } else if (
        chef.burnoutScore >= 40
      ) {

        chef.burnoutRisk =
          'HIGH'

      } else if (
        chef.burnoutScore >= 20
      ) {

        chef.burnoutRisk =
          'MODERATE'

      } else {

        chef.burnoutRisk =
          'LOW'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort Highest Risk First
  |--------------------------------------------------------------------------
  */

  burnoutReport.sort(
    (a, b) =>
      b.burnoutScore -
      a.burnoutScore
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_burnout_risk')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      burnout_report:
        burnoutReport,

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
        'GENERATE_KITCHEN_BURNOUT_RISK',

      metadata: {

        chefs:
          burnoutReport.length,

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

    burnoutReport,

  }
}
