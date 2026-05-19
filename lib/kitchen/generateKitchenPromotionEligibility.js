import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenPromotionEligibility({
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
  | Build Promotion Matrix
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

        leadershipScore: 100,

        promotionEligibility:
          'NOT_ELIGIBLE',

        recommendedRole:
          'CURRENT_ROLE',

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
      chef.leadershipScore -= 2
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chef.rejectedItems += 1
      chef.leadershipScore -= 5
    }

    if (
      item.priority ===
      'URGENT'
    ) {

      chef.urgentItems += 1
      chef.leadershipScore += 0.5
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Final Promotion Decisions
  |--------------------------------------------------------------------------
  */

  const promotionReport =
    Object.values(
      chefMap
    ).map(chef => {

      if (
        chef.leadershipScore > 100
      ) {

        chef.leadershipScore = 100
      }

      if (
        chef.leadershipScore >= 95 &&
        chef.totalItems >= 200
      ) {

        chef.promotionEligibility =
          'EXECUTIVE_CHEF_TRACK'

        chef.recommendedRole =
          'EXECUTIVE_CHEF'

      } else if (
        chef.leadershipScore >= 90 &&
        chef.totalItems >= 120
      ) {

        chef.promotionEligibility =
          'SOUS_CHEF_TRACK'

        chef.recommendedRole =
          'SOUS_CHEF'

      } else if (
        chef.leadershipScore >= 80
      ) {

        chef.promotionEligibility =
          'TEAM_LEAD_TRACK'

        chef.recommendedRole =
          'SENIOR_CHEF'

      } else {

        chef.promotionEligibility =
          'NOT_ELIGIBLE'

        chef.recommendedRole =
          'CURRENT_ROLE'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort Best Candidates First
  |--------------------------------------------------------------------------
  */

  promotionReport.sort(
    (a, b) =>
      b.leadershipScore -
      a.leadershipScore
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_promotion_eligibility')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      promotion_report:
        promotionReport,

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
        'GENERATE_KITCHEN_PROMOTION_ELIGIBILITY',

      metadata: {

        chefs:
          promotionReport.length,

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

    promotionReport,

  }
}
