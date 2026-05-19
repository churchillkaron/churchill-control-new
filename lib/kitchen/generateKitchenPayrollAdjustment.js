import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenPayrollAdjustment({
  tenantId,
  month,
  year,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const targetMonth =
    month ||
    new Date().getMonth() + 1

  const targetYear =
    year ||
    new Date().getFullYear()

  const startDate =
    new Date(
      targetYear,
      targetMonth - 1,
      1
    ).toISOString()

  const endDate =
    new Date(
      targetYear,
      targetMonth,
      0,
      23,
      59,
      59
    ).toISOString()

  /*
  |--------------------------------------------------------------------------
  | Load Kitchen Queue
  |--------------------------------------------------------------------------
  */

  const {
    data: kitchenQueue,
    error: queueError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .gte(
      'created_at',
      startDate
    )
    .lte(
      'created_at',
      endDate
    )

  if (queueError) {
    throw new Error(
      queueError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Build Chef Metrics
  |--------------------------------------------------------------------------
  */

  const chefMetrics = {}

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
      !chefMetrics[
        item.chef_id
      ]
    ) {

      chefMetrics[
        item.chef_id
      ] = {

        chefId:
          item.chef_id,

        chefName:
          item.chef_name,

        total: 0,

        completed: 0,

        served: 0,

        returned: 0,

        rejected: 0,

        score: 100,

      }
    }

    const chef =
      chefMetrics[
        item.chef_id
      ]

    chef.total += 1

    if (
      item.status ===
      'COMPLETED'
    ) {

      chef.completed += 1
    }

    if (
      item.status ===
      'SERVED'
    ) {

      chef.served += 1
    }

    if (
      item.status ===
      'RETURNED'
    ) {

      chef.returned += 1

      chef.score -= 3
    }

    if (
      item.status ===
      'REJECTED'
    ) {

      chef.rejected += 1

      chef.score -= 7
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Payroll Multipliers
  |--------------------------------------------------------------------------
  */

  const payrollAdjustments = []

  for (
    const chefId in
    chefMetrics
  ) {

    const chef =
      chefMetrics[chefId]

    let multiplier = 1
    let level = 'GOOD'

    if (
      chef.score >= 95
    ) {

      multiplier = 1.2
      level = 'ELITE'

    } else if (
      chef.score >= 85
    ) {

      multiplier = 1.1
      level = 'GOOD'

    } else if (
      chef.score >= 70
    ) {

      multiplier = 0.9
      level = 'WARNING'

    } else {

      multiplier = 0.7
      level = 'CRITICAL'
    }

    payrollAdjustments.push({

      chefId:
        chef.chefId,

      chefName:
        chef.chefName,

      totalItems:
        chef.total,

      completedItems:
        chef.completed,

      servedItems:
        chef.served,

      returnedItems:
        chef.returned,

      rejectedItems:
        chef.rejected,

      performanceScore:
        chef.score,

      performanceLevel:
        level,

      payrollMultiplier:
        multiplier,

    })
  }

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_payroll_adjustments')
    .insert({

      tenant_id:
        tenantId,

      report_month:
        targetMonth,

      report_year:
        targetYear,

      payroll_adjustments:
        payrollAdjustments,

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
        'GENERATE_KITCHEN_PAYROLL_ADJUSTMENT',

      metadata: {

        month:
          targetMonth,

        year:
          targetYear,

        chefs:
          payrollAdjustments.length,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    month:
      targetMonth,

    year:
      targetYear,

    payrollAdjustments,

  }
}
