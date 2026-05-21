import { supabase } from '@/lib/shared/supabase/client'

export async function reassignKitchenItemStation({
  tenantId,
  kitchenQueueId,
  station = 'HOT',
  reassignedBy = 'CHEF',
  reason = 'Reassign kitchen station',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  const allowedStations = [
    'HOT',
    'COLD',
    'GRILL',
    'FRY',
    'DESSERT',
    'BAR',
    'PASS',
  ]

  if (
    !allowedStations.includes(
      station
    )
  ) {

    throw new Error(
      'Invalid station'
    )
  }

  const {
    data: kitchenItem,
    error: kitchenItemError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenQueueId
    )
    .single()

  if (
    kitchenItemError ||
    !kitchenItem
  ) {

    throw new Error(
      'Kitchen queue item not found'
    )
  }

  if (
    [
      'COMPLETED',
      'BUMPED',
      'VOIDED',
    ].includes(
      kitchenItem.status
    )
  ) {

    throw new Error(
      'Cannot reassign finalized item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Reassign Station
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      station,

      reassigned_by:
        reassignedBy,

      reassign_reason:
        reason,

      reassigned_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenQueueId
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
        'REASSIGN_KITCHEN_STATION',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        order_item_id:
          kitchenItem.order_item_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        station,

        reassigned_by:
          reassignedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    station,

  }
}
