import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenPsychologicalStability({
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
      180 * 24 * 60 * 60 * 1000
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
  | Build Stability Matrix
  |--------------------------------------------------------------------------
  */

  const stabilityMap = {}

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
      !stabilityMap[
        item.chef_id
      ]
    ) {

      stabilityMap[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        stressResistance: 100,

        emotionalConsistency: 100,

        pressureRecovery: 100,

        operationalDiscipline: 100,

        returnedItems: 0,

        rejectedItems: 0,

        delayedItems: 0,

        urgentItems: 0,

        stabilityScore: 100,

        psychologicalRisk:
          'LOW',

      }
    }

    const chef =
      stabilityMap[
        item.chef_id
      ]

    /*
    |--------------------------------------------------------------------------
    | Returned Items
    |--------------------------------------------------------------------------
    */

    if (
      item.status ===
      'RETURNED'
    ) {

      chef.returnedItems += 1

      chef.emotionalConsistency -= 2
      chef.operationalDiscipline -= 1
    }

    /*
    |--------------------------------------------------------------------------
    | Rejected Items
    |--------------------------------------------------------------------------
    */

    if (
      item.status ===
      'REJECTED'
    ) {

      chef.rejectedItems += 1

      chef.stressResistance -= 4
      chef.emotionalConsistency -= 4
      chef.operationalDiscipline -= 3
    }

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

      chef.pressureRecovery += 0.2
    }

    /*
    |--------------------------------------------------------------------------
    | Delay Handling
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

        chef.stressResistance -= 3
        chef.pressureRecovery -= 3
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Final Stability Scores
  |--------------------------------------------------------------------------
  */

  const stabilityReport =
    Object.values(
      stabilityMap
    ).map(chef => {

      chef.stabilityScore =
        Number(
          (
            (
              chef.stressResistance +
              chef.emotionalConsistency +
              chef.pressureRecovery +
              chef.operationalDiscipline
            ) / 4
          ).toFixed(2)
        )

      if (
        chef.stabilityScore > 100
      ) {

        chef.stabilityScore = 100
      }

      if (
        chef.stabilityScore < 0
      ) {

        chef.stabilityScore = 0
      }

      if (
        chef.stabilityScore >= 90
      ) {

        chef.psychologicalRisk =
          'LOW'

      } else if (
        chef.stabilityScore >= 75
      ) {

        chef.psychologicalRisk =
          'MODERATE'

      } else if (
        chef.stabilityScore >= 60
      ) {

        chef.psychologicalRisk =
          'HIGH'

      } else {

        chef.psychologicalRisk =
          'CRITICAL'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort Highest Stability First
  |--------------------------------------------------------------------------
  */

  stabilityReport.sort(
    (a, b) =>
      b.stabilityScore -
      a.stabilityScore
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_psychological_stability')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      stability_report:
        stabilityReport,

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
        'GENERATE_KITCHEN_PSYCHOLOGICAL_STABILITY',

      metadata: {

        chefs:
          stabilityReport.length,

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

    stabilityReport,

  }
}
