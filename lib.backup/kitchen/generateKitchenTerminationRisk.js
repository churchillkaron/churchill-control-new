import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenTerminationRisk({
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
  | Build Risk Matrix
  |--------------------------------------------------------------------------
  */

  const riskMap = {}

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
      !riskMap[
        item.chef_id
      ]
    ) {

      riskMap[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        returnedItems: 0,

        rejectedItems: 0,

        cancelledItems: 0,

        excessiveDelays: 0,

        totalRiskPoints: 0,

        terminationRisk:
          'LOW',

        recommendation:
          'No action required',

      }
    }

    const chef =
      riskMap[
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
      chef.totalRiskPoints += 2
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
      chef.totalRiskPoints += 5
    }

    /*
    |--------------------------------------------------------------------------
    | Cancelled Items
    |--------------------------------------------------------------------------
    */

    if (
      item.status ===
      'CANCELLED'
    ) {

      chef.cancelledItems += 1
      chef.totalRiskPoints += 2
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
        prepMinutes > 35
      ) {

        chef.excessiveDelays += 1
        chef.totalRiskPoints += 3
      }
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Final Risk Levels
  |--------------------------------------------------------------------------
  */

  const terminationReport =
    Object.values(
      riskMap
    ).map(chef => {

      if (
        chef.totalRiskPoints >= 40
      ) {

        chef.terminationRisk =
          'CRITICAL'

        chef.recommendation =
          'Immediate termination review recommended'

      } else if (
        chef.totalRiskPoints >= 25
      ) {

        chef.terminationRisk =
          'HIGH'

        chef.recommendation =
          'Final warning and performance probation required'

      } else if (
        chef.totalRiskPoints >= 10
      ) {

        chef.terminationRisk =
          'MEDIUM'

        chef.recommendation =
          'Mandatory retraining and monitoring'

      } else {

        chef.terminationRisk =
          'LOW'

        chef.recommendation =
          'No disciplinary escalation required'
      }

      return chef
    })

  /*
  |--------------------------------------------------------------------------
  | Sort Highest Risk First
  |--------------------------------------------------------------------------
  */

  terminationReport.sort(
    (a, b) =>
      b.totalRiskPoints -
      a.totalRiskPoints
  )

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_termination_risk_reports')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      termination_report:
        terminationReport,

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
        'GENERATE_KITCHEN_TERMINATION_RISK',

      metadata: {

        chefs:
          terminationReport.length,

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

    terminationReport,

  }
}
