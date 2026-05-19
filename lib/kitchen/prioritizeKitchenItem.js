import { supabase } from '@/lib/shared/supabase/client'

export async function prioritizeKitchenItem({
  tenantId,
  kitchenQueueId,
  priority = 'HIGH',
  prioritizedBy = 'KITCHEN',
  reason = 'Priority item',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  const allowedPriorities = [
    'LOW',
    'NORMAL',
    'HIGH',
    'URGENT',
  ]

  if (
    !allowedPriorities.includes(
      priority
    )
  ) {

    throw new Error(
      'Invalid priority'
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
    kitchenItem.status ===
    'COMPLETED'
  ) {

    throw new Error(
      'Cannot prioritize completed item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Apply Priority
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      priority,

      prioritized_by:
        prioritizedBy,

      priority_reason:
        reason,

      prioritized_at:
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
        'PRIORITIZE_KITCHEN_ITEM',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        priority,

        prioritized_by:
          prioritizedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    priority,

  }
}
