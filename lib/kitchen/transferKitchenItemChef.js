import { supabase } from '@/lib/shared/supabase/client'

export async function transferKitchenItemChef({
  tenantId,
  kitchenQueueId,
  newChefId,
  newChefName,
  transferredBy = 'CHEF_MANAGER',
  reason = 'Transfer kitchen item chef',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  if (!newChefId) {
    throw new Error('newChefId required')
  }

  if (!newChefName) {
    throw new Error('newChefName required')
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
      'Cannot transfer finalized item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Transfer Chef Assignment
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      previous_chef_id:
        kitchenItem.chef_id,

      previous_chef_name:
        kitchenItem.chef_name,

      chef_id:
        newChefId,

      chef_name:
        newChefName,

      transferred_by:
        transferredBy,

      transfer_reason:
        reason,

      transferred_at:
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
        'TRANSFER_KITCHEN_ITEM_CHEF',

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

        new_chef_id:
          newChefId,

        new_chef_name:
          newChefName,

        transferred_by:
          transferredBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    previousChefId:
      kitchenItem.chef_id,

    previousChefName:
      kitchenItem.chef_name,

    newChefId:
      newChefId,

    newChefName:
      newChefName,

  }
}
