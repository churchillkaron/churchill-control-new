import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenOwnershipMatrix({
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
  | Build Ownership Matrix
  |--------------------------------------------------------------------------
  */

  const ownershipMatrix = {}

  for (
    const item of
    kitchenQueue || []
  ) {

    const chef =
      item.chef_name ||
      'UNASSIGNED'

    if (
      !ownershipMatrix[
        chef
      ]
    ) {

      ownershipMatrix[
        chef
      ] = {

        chefName:
          chef,

        totalItems: 0,

        completedItems: 0,

        servedItems: 0,

        returnedItems: 0,

        rejectedItems: 0,

        cancelledItems: 0,

        urgentItems: 0,

        ownershipScore: 100,

        accountabilityLevel:
          'GOOD',

      }
    }

    const chefStats =
      ownershipMatrix[
        chef
      ]

    chefStats.totalItems += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      chefStats.completedItems += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      chefStats.servedItems += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      chefStats.returnedItems += 1

      chefStats.ownershipScore -= 3
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chefStats.rejectedItems += 1

      chefStats.ownershipScore -= 7
    }

    if (
      item.status ===
      'CANCELLED'
    ) {

      chefStats.cancelledItems += 1

      chefStats.ownershipScore -= 2
    }

    if (
      item.priority ===
      'URGENT'
    ) {

      chefStats.urgentItems += 1
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Finalize Accountability Levels
  |--------------------------------------------------------------------------
  */

  const finalizedMatrix =
    Object.values(
      ownershipMatrix
    ).map(chef => {

      if (
        chef.ownershipScore > 100
      ) {

        chef.ownershipScore = 100
      }

      if (
        chef.ownershipScore < 0
      ) {

        chef.ownershipScore = 0
      }

      if (
        chef.ownershipScore >= 95
      ) {

        chef.accountabilityLevel =
          'ELITE'

      } else if (
        chef.ownershipScore >= 80
      ) {

        chef.accountabilityLevel =
          'GOOD'

      } else if (
        chef.ownershipScore >= 60
      ) {

        chef.accountabilityLevel =
          'WARNING'

      } else {

        chef.accountabilityLevel =
          'CRITICAL'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort By Ownership Score
  |--------------------------------------------------------------------------
  */

  finalizedMatrix.sort(
    (a, b) =>
      b.ownershipScore -
      a.ownershipScore
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_ownership_matrix')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      ownership_matrix:
        finalizedMatrix,

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
        'GENERATE_KITCHEN_OWNERSHIP_MATRIX',

      metadata: {

        chefs:
          finalizedMatrix.length,

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

    ownershipMatrix:
      finalizedMatrix,

  }
}
