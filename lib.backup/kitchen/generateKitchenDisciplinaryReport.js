import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenDisciplinaryReport({
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
  | Build Disciplinary Matrix
  |--------------------------------------------------------------------------
  */

  const disciplinaryMap = {}

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
      !disciplinaryMap[
        item.chef_id
      ]
    ) {

      disciplinaryMap[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        violations: [],

        warningPoints: 0,

        suspensionRisk:
          false,

        disciplinaryLevel:
          'GOOD',

      }
    }

    const chef =
      disciplinaryMap[
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

      chef.warningPoints += 2

      chef.violations.push({

        type:
          'RETURNED_ITEM',

        kitchenQueueId:
          item.id,

        tableNumber:
          item.table_number,

        dishName:
          item.dish_name,

      })
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

      chef.warningPoints += 5

      chef.violations.push({

        type:
          'REJECTED_ITEM',

        kitchenQueueId:
          item.id,

        tableNumber:
          item.table_number,

        dishName:
          item.dish_name,

      })
    }

    /*
    |--------------------------------------------------------------------------
    | Delayed Items
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
        prepMinutes > 30
      ) {

        chef.warningPoints += 3

        chef.violations.push({

          type:
            'EXCESSIVE_DELAY',

          kitchenQueueId:
            item.id,

          prepMinutes:
            Number(
              prepMinutes.toFixed(2)
            ),

          dishName:
            item.dish_name,

        })
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Finalize Discipline Levels
  |--------------------------------------------------------------------------
  */

  const disciplinaryReport =
    Object.values(
      disciplinaryMap
    ).map(chef => {

      if (
        chef.warningPoints >= 15
      ) {

        chef.disciplinaryLevel =
          'SUSPENSION_RISK'

        chef.suspensionRisk =
          true

      } else if (
        chef.warningPoints >= 10
      ) {

        chef.disciplinaryLevel =
          'FINAL_WARNING'

      } else if (
        chef.warningPoints >= 5
      ) {

        chef.disciplinaryLevel =
          'WARNING'

      } else {

        chef.disciplinaryLevel =
          'GOOD'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_disciplinary_reports')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      disciplinary_report:
        disciplinaryReport,

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
        'GENERATE_KITCHEN_DISCIPLINARY_REPORT',

      metadata: {

        chefs:
          disciplinaryReport.length,

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

    disciplinaryReport,

  }
}
