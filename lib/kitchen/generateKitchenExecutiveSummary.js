import { supabase } from '@/lib/shared/supabase/client'

export async function generateKitchenExecutiveSummary({
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
  | Load Kitchen Data
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
  | Core Metrics
  |--------------------------------------------------------------------------
  */

  const totalItems =
    kitchenQueue?.length || 0

  const completedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'COMPLETED'
    ).length || 0

  const servedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'SERVED'
    ).length || 0

  const returnedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'RETURNED'
    ).length || 0

  const rejectedItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'REJECTED'
    ).length || 0

  const cancelledItems =
    kitchenQueue?.filter(
      item =>
        item.status ===
        'CANCELLED'
    ).length || 0

  /*
  |--------------------------------------------------------------------------
  | Financial Protection Score
  |--------------------------------------------------------------------------
  */

  let operationalScore = 100

  operationalScore -=
    returnedItems * 0.5

  operationalScore -=
    rejectedItems * 2

  operationalScore -=
    cancelledItems * 1

  if (
    operationalScore < 0
  ) {

    operationalScore = 0
  }

  /*
  |--------------------------------------------------------------------------
  | Service Charge Projection
  |--------------------------------------------------------------------------
  */

  let serviceChargeProjection =
    '5%'

  if (
    operationalScore >= 95
  ) {

    serviceChargeProjection =
      '7%'

  } else if (
    operationalScore >= 85
  ) {

    serviceChargeProjection =
      '6%'
  }

  /*
  |--------------------------------------------------------------------------
  | AI Executive Decision
  |--------------------------------------------------------------------------
  */

  let executiveDecision =
    'STABLE'

  let executiveMessage =
    'Kitchen operations stable.'

  if (
    operationalScore < 60
  ) {

    executiveDecision =
      'CRITICAL'

    executiveMessage =
      'Kitchen operations require immediate management intervention.'

  } else if (
    operationalScore < 80
  ) {

    executiveDecision =
      'WARNING'

    executiveMessage =
      'Kitchen performance declining. Operational review recommended.'

  } else if (
    operationalScore >= 95
  ) {

    executiveDecision =
      'ELITE'

    executiveMessage =
      'Kitchen operating at elite performance standards.'
  }

  /*
  |--------------------------------------------------------------------------
  | Save Snapshot
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_executive_reports')
    .insert({

      tenant_id:
        tenantId,

      start_date:
        fromDate,

      end_date:
        toDate,

      total_items:
        totalItems,

      completed_items:
        completedItems,

      served_items:
        servedItems,

      returned_items:
        returnedItems,

      rejected_items:
        rejectedItems,

      cancelled_items:
        cancelledItems,

      operational_score:
        operationalScore,

      service_charge_projection:
        serviceChargeProjection,

      executive_decision:
        executiveDecision,

      executive_message:
        executiveMessage,

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
        'GENERATE_KITCHEN_EXECUTIVE_SUMMARY',

      metadata: {

        operational_score:
          operationalScore,

        executive_decision:
          executiveDecision,

        service_charge_projection:
          serviceChargeProjection,

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

    summary: {

      totalItems,

      completedItems,

      servedItems,

      returnedItems,

      rejectedItems,

      cancelledItems,

      operationalScore,

      serviceChargeProjection,

      executiveDecision,

      executiveMessage,

    },

  }
}
