import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenSuccessionPlanning({
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
      365 * 24 * 60 * 60 * 1000
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
  | Build Succession Matrix
  |--------------------------------------------------------------------------
  */

  const successionMap = {}

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
      !successionMap[
        item.chef_id
      ]
    ) {

      successionMap[
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

        successionScore: 100,

        successionTier:
          'STANDARD',

        futureRole:
          'CURRENT_POSITION',

      }
    }

    const chef =
      successionMap[
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
      chef.successionScore -= 2
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chef.rejectedItems += 1
      chef.successionScore -= 5
    }

    if (
      item.priority ===
      'URGENT'
    ) {

      chef.urgentItems += 1
      chef.successionScore += 0.25
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Final Succession Decisions
  |--------------------------------------------------------------------------
  */

  const successionReport =
    Object.values(
      successionMap
    ).map(chef => {

      if (
        chef.successionScore > 100
      ) {

        chef.successionScore = 100
      }

      if (
        chef.successionScore >= 97 &&
        chef.totalItems >= 400
      ) {

        chef.successionTier =
          'EXECUTIVE_SUCCESSOR'

        chef.futureRole =
          'HEAD_OF_KITCHEN_OPERATIONS'

      } else if (
        chef.successionScore >= 92 &&
        chef.totalItems >= 250
      ) {

        chef.successionTier =
          'LEADERSHIP_SUCCESSOR'

        chef.futureRole =
          'EXECUTIVE_CHEF'

      } else if (
        chef.successionScore >= 85 &&
        chef.totalItems >= 150
      ) {

        chef.successionTier =
          'MANAGEMENT_TRACK'

        chef.futureRole =
          'SOUS_CHEF'

      } else {

        chef.successionTier =
          'STANDARD'

        chef.futureRole =
          'CURRENT_POSITION'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort Best Successors First
  |--------------------------------------------------------------------------
  */

  successionReport.sort(
    (a, b) =>
      b.successionScore -
      a.successionScore
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_succession_planning')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      succession_report:
        successionReport,

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
        'GENERATE_KITCHEN_SUCCESSION_PLANNING',

      metadata: {

        chefs:
          successionReport.length,

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

    successionReport,

  }
}
