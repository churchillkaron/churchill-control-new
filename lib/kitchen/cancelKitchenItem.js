import { supabase } from '@/lib/shared/supabase/client'

export async function cancelKitchenItem({
  tenantId,
  kitchenQueueId,
  cancelledBy = 'KITCHEN',
  reason = 'Cancelled item',
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
      'CANCELLED',
    ].includes(
      kitchenItem.status
    )
  ) {

    throw new Error(
      'Cannot cancel finalized item'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Cancel Kitchen Queue Item
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'CANCELLED',

      cancelled_by:
        cancelledBy,

      cancel_reason:
        reason,

      cancelled_at:
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
  | Remove Order Item
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('order_items')
    .delete()
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenItem.order_item_id
    )

  /*
  |--------------------------------------------------------------------------
  | Recalculate Order Totals
  |--------------------------------------------------------------------------
  */

  const {
    data: remainingItems,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_id',
      kitchenItem.order_id
    )

  const orderTotal =
    (remainingItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    )

  const orderCost =
    (remainingItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.cost || 0),
      0
    )

  await supabase
    .from('orders')
    .update({

      total:
        orderTotal,

      total_amount:
        orderTotal,

      cost:
        orderCost,

      updated_at:
        new Date().toISOString(),

      ...(remainingItems.length === 0 && {

        status:
          'VOIDED',

        kitchen_status:
          'VOIDED',

        production_status:
          'VOIDED',

      }),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenItem.order_id
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
        'CANCEL_KITCHEN_ITEM',

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

        cancelled_by:
          cancelledBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'CANCELLED',

    orderTotal,

    orderCost,

    remainingItems:
      remainingItems.length,

  }
}
