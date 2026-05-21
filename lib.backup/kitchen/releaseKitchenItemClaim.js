import { supabase } from '@/lib/shared/supabase/client'

export async function releaseKitchenItemClaim({
  tenantId,
  kitchenQueueId,
  releasedBy = 'CHEF_MANAGER',
  reason = 'Release kitchen item claim',
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
    !kitchenItem.chef_id
  ) {

    throw new Error(
      'Kitchen item is not claimed'
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
      'Cannot release finalized item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Release Claim
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
        null,

      chef_name:
        null,

      released_by:
        releasedBy,

      release_reason:
        reason,

      released_at:
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
        'RELEASE_KITCHEN_ITEM_CLAIM',

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

        released_by:
          releasedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    released: true,

  }
}
