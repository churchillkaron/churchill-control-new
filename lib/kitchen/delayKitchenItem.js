import { supabase } from '@/lib/shared/supabase/client'

export async function delayKitchenItem({
  tenantId,
  kitchenQueueId,
  delayMinutes = 5,
  delayedBy = 'KITCHEN',
  reason = 'Delayed item',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenQueueId) {
    throw new Error('kitchenQueueId required')
  }

  if (
    Number(delayMinutes) <= 0
  ) {

    throw new Error(
      'Invalid delay minutes'
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
    ].includes(
      kitchenItem.status
    )
  ) {

    throw new Error(
      'Cannot delay finalized item'
    )
  }

  const delayedUntil =
    new Date(
      Date.now() +
      (
        Number(delayMinutes) *
        60 *
        1000
      )
    ).toISOString()

  /*
  |--------------------------------------------------------------------------
  | Delay Kitchen Item
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'DELAYED',

      delayed_until:
        delayedUntil,

      delay_minutes:
        Number(delayMinutes),

      delayed_by:
        delayedBy,

      delay_reason:
        reason,

      delayed_at:
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
        'DELAY_KITCHEN_ITEM',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        delay_minutes:
          delayMinutes,

        delayed_until:
          delayedUntil,

        delayed_by:
          delayedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'DELAYED',

    delayMinutes:
      Number(delayMinutes),

    delayedUntil,

  }
}
