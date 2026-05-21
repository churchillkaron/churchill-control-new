import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenLeaderboard({
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
      30 * 24 * 60 * 60 * 1000
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
  | Build Chef Rankings
  |--------------------------------------------------------------------------
  */

  const chefMap = {}

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
      !chefMap[
        item.chef_id
      ]
    ) {

      chefMap[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        totalItems: 0,

        completedItems: 0,

        servedItems: 0,

        returnedItems: 0,

        rejectedItems: 0,

        urgentItems: 0,

        totalPrepMinutes: 0,

        prepCount: 0,

        score: 100,

      }
    }

    const chef =
      chefMap[
        item.chef_id
      ]

    chef.totalItems += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      chef.completedItems += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      chef.servedItems += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      chef.returnedItems += 1

      chef.score -= 3
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chef.rejectedItems += 1

      chef.score -= 7
    }

    if (
      item.priority ===
      'URGENT'
    ) {

      chef.urgentItems += 1
    }

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

      chef.totalPrepMinutes +=
        prepMinutes

      chef.prepCount += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Calculate Final Metrics
  |--------------------------------------------------------------------------
  */

  const leaderboard = Object.values(
    chefMap
  ).map(chef => {

    const averagePrepMinutes =
      chef.prepCount > 0
        ? Number(
            (
              chef.totalPrepMinutes /
              chef.prepCount
            ).toFixed(2)
          )
        : 0

    if (
      averagePrepMinutes > 20
    ) {

      chef.score -= 10
    }

    if (
      chef.score < 0
    ) {

      chef.score = 0
    }

    let level =
      'GOOD'

    if (
      chef.score >= 95
    ) {

      level = 'ELITE'

    } else if (
      chef.score >= 80
    ) {

      level = 'GOOD'

    } else if (
      chef.score >= 60
    ) {

      level = 'WARNING'

    } else {

      level = 'CRITICAL'
    }

    return {

      chefId:
        chef.chefId,

      chefName:
        chef.chefName,

      totalItems:
        chef.totalItems,

      completedItems:
        chef.completedItems,

      servedItems:
        chef.servedItems,

      returnedItems:
        chef.returnedItems,

      rejectedItems:
        chef.rejectedItems,

      urgentItems:
        chef.urgentItems,

      averagePrepMinutes,

      performanceScore:
        chef.score,

      performanceLevel:
        level,

    }
  })

  /*
  |--------------------------------------------------------------------------
  | Sort Leaderboard
  |--------------------------------------------------------------------------
  */

  leaderboard.sort(
    (a, b) =>
      b.performanceScore -
      a.performanceScore
  )

  /*
  |--------------------------------------------------------------------------
  | Add Rankings
  |--------------------------------------------------------------------------
  */

  const rankedLeaderboard =
    leaderboard.map(
      (
        chef,
        index
      ) => ({

        rank:
          index + 1,

        ...chef,

      })
    )

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
        'GENERATE_KITCHEN_LEADERBOARD',

      metadata: {

        chefs:
          rankedLeaderboard.length,

        start_date:
          fromDate,

        end_date:
          toDate,

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

    leaderboard:
      rankedLeaderboard,

  }
}
