import { supabase } from '@/lib/shared/supabase/client'

import loadOperationalSettings
from '@/lib/settings/loadOperationalSettings'

export async function generateKitchenCultureScore({
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

  const kitchenSettings =
    await loadOperationalSettings({

      tenantId,

      domain:
        'KITCHEN',

    })

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
  | Build Culture Matrix
  |--------------------------------------------------------------------------
  */

  const cultureMap = {}

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
      !cultureMap[
        item.chef_id
      ]
    ) {

      cultureMap[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        teamworkScore: 100,

        disciplineScore: 100,

        consistencyScore: 100,

        pressureHandlingScore: 100,

        returnedItems: 0,

        rejectedItems: 0,

        urgentItems: 0,

        delayedItems: 0,

        totalItems: 0,

        cultureScore: 100,

        cultureLevel:
          'GOOD',

      }
    }

    const chef =
      cultureMap[
        item.chef_id
      ]

    chef.totalItems += 1

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

      chef.consistencyScore -= 3
      chef.disciplineScore -= 1
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

      chef.disciplineScore -= 5
      chef.consistencyScore -= 5
      chef.teamworkScore -= 2
    }

    /*
    |--------------------------------------------------------------------------
    | Urgent Items
    |--------------------------------------------------------------------------
    */

    if (
      item.priority ===
      'URGENT'
    ) {

      chef.urgentItems += 1

      chef.pressureHandlingScore += 0.3
    }

    /*
    |--------------------------------------------------------------------------
    | Delays
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
        prepMinutes >
        Number(
          kitchenSettings?.critical_time_minutes || 30
        )
      ) {

        chef.delayedItems += 1

        chef.pressureHandlingScore -= 3
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Final Culture Scores
  |--------------------------------------------------------------------------
  */

  const cultureReport =
    Object.values(
      cultureMap
    ).map(chef => {

      chef.cultureScore =
        Number(
          (
            (
              chef.teamworkScore +
              chef.disciplineScore +
              chef.consistencyScore +
              chef.pressureHandlingScore
            ) / 4
          ).toFixed(2)
        )

      if (
        chef.cultureScore > 100
      ) {

        chef.cultureScore = 100
      }

      if (
        chef.cultureScore < 0
      ) {

        chef.cultureScore = 0
      }

      if (
        chef.cultureScore >= 95
      ) {

        chef.cultureLevel =
          'ELITE'

      } else if (
        chef.cultureScore >= 80
      ) {

        chef.cultureLevel =
          'GOOD'

      } else if (
        chef.cultureScore >= 60
      ) {

        chef.cultureLevel =
          'WARNING'

      } else {

        chef.cultureLevel =
          'TOXIC_RISK'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort Highest Culture First
  |--------------------------------------------------------------------------
  */

  cultureReport.sort(
    (a, b) =>
      b.cultureScore -
      a.cultureScore
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_culture_scores')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      culture_report:
        cultureReport,

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
        'GENERATE_KITCHEN_CULTURE_SCORE',

      metadata: {

        chefs:
          cultureReport.length,

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

    cultureReport,

  }
}
