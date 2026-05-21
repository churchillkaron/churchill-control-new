import { supabase } from '@/lib/shared/supabase/client'

export async function removeOrderItem({
  tenantId,
  orderItemId,
  removedBy = 'SYSTEM',
  reason = 'Remove order item',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!orderItemId) {
    throw new Error('orderItemId required')
  }

  const {
    data: orderItem,
    error: orderItemError,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderItemId
    )
    .single()

  if (
    orderItemError ||
    !orderItem
  ) {

    throw new Error(
      'Order item not found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Delete Modifiers First
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('order_item_modifiers')
    .delete()
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'order_item_id',
      orderItemId
    )

  /*
  |--------------------------------------------------------------------------
  | Delete Order Item
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
      orderItemId
    )

  /*
  |--------------------------------------------------------------------------
  | Recalculate Order
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
      orderItem.order_id
    )

  const updatedOrderTotal =
    (remainingItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    )

  const updatedOrderCost =
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
        updatedOrderTotal,

      total_amount:
        updatedOrderTotal,

      cost:
        updatedOrderCost,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderItem.order_id
    )

  /*
  |--------------------------------------------------------------------------
  | Auto Void Empty Orders
  |--------------------------------------------------------------------------
  */

  if (
    !remainingItems ||
    remainingItems.length === 0
  ) {

    await supabase
      .from('orders')
      .update({

        status:
          'VOIDED',

        kitchen_status:
          'VOIDED',

        production_status:
          'VOIDED',

        updated_at:
          new Date().toISOString(),

      })
      .eq(
        'tenant_id',
        tenantId
      )
      .eq(
        'id',
        orderItem.order_id
      )

    await supabase
      .from('kitchen_tickets')
      .update({

        status:
          'VOIDED',

        updated_at:
          new Date().toISOString(),

      })
      .eq(
        'tenant_id',
        tenantId
      )
      .eq(
        'order_id',
        orderItem.order_id
      )
  }

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
        'pos',

      action:
        'REMOVE_ORDER_ITEM',

      reference_id:
        orderItem.order_id,

      metadata: {

        order_item_id:
          orderItemId,

        dish_name:
          orderItem.dish_name,

        quantity:
          orderItem.quantity,

        total:
          orderItem.total,

        removed_by:
          removedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderItemId,

    updatedOrderTotal,

    updatedOrderCost,

    orderVoided:
      !remainingItems ||
      remainingItems.length === 0,

  }
}
