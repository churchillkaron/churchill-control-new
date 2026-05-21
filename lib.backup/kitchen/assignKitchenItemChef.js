import { supabase } from '@/lib/shared/supabase/client'

export async function assignKitchenItemChef({
  tenantId,
  kitchenQueueId,
  chefId,
  chefName,
  assignedBy = 'CHEF_MANAGER',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  if (!chefId) {
    throw new Error('chefId required')
  }

  if (!chefName) {
    throw new Error('chefName required')
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
      'Cannot assign finalized item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Assign Chef
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      chef_id:
        chefId,

      chef_name:
        chefName,

      assigned_by:
        assignedBy,

      assigned_at:
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
        'ASSIGN_KITCHEN_ITEM_CHEF',

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

        chef_id:
          chefId,

        chef_name:
          chefName,

        assigned_by:
          assignedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    chefId,

    chefName,

  }
}
