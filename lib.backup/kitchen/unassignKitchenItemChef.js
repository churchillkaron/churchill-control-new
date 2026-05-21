import { supabase } from '@/lib/shared/supabase/client'

export async function unassignKitchenItemChef({
  tenantId,
  kitchenQueueId,
  unassignedBy = 'CHEF_MANAGER',
  reason = 'Unassign chef',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
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
      'Cannot unassign finalized item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Unassign Chef
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      chef_id:
        null,

      chef_name:
        null,

      unassigned_by:
        unassignedBy,

      unassign_reason:
        reason,

      unassigned_at:
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
        'UNASSIGN_KITCHEN_ITEM_CHEF',

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

        previous_chef_id:
          kitchenItem.chef_id,

        previous_chef_name:
          kitchenItem.chef_name,

        unassigned_by:
          unassignedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    chefRemoved:
      true,

  }
}
