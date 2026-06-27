import { supabase } from '@/lib/shared/supabase/client'

export async function updateOrderItemQuantity({
  organizationId,
  orderItemId,
  quantity,
  updatedBy = 'SYSTEM',
  reason = 'Update quantity',
}) {

  if (!organizationId) {
    throw new Error('organizationId required')
  }

  if (!orderItemId) {
    throw new Error('orderItemId required')
  }

  if (
    Number(quantity) <= 0
  ) {

    throw new Error(
      'Quantity must be greater than 0'
    )
  }

  const {
    data: orderItem,
    error: itemError,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      orderItemId
    )
    .single()

  if (
    itemError ||
    !orderItem
  ) {

    throw new Error(
      'Order item not found'
    )
  }

  const oldQuantity =
    Number(
      orderItem.quantity || 1
    )

  const unitPrice =
    Number(
      orderItem.price || 0
    )

  const unitCost =
    Number(
      orderItem.cost || 0
    )

  /*
  |--------------------------------------------------------------------------
  | Modifier Total
  |--------------------------------------------------------------------------
  */

  const {
    data: modifiers,
  } = await supabase
    .from('order_item_modifiers')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'order_item_id',
      orderItemId
    )

  const modifierTotal =
    (modifiers || []).reduce(
      (sum, modifier) =>
        sum +
        Number(modifier.total || 0),
      0
    )

  /*
  |--------------------------------------------------------------------------
  | Recalculate Item
  |--------------------------------------------------------------------------
  */

  const itemSubtotal =
    unitPrice *
    Number(quantity)

  const updatedTotal =
    Number(
      (
        itemSubtotal +
        modifierTotal
      ).toFixed(2)
    )

  const updatedCost =
    Number(
      (
        unitCost *
        Number(quantity)
      ).toFixed(2)
    )

  await supabase
    .from('order_items')
    .update({

      quantity:
        Number(quantity),

      total:
        updatedTotal,

      cost:
        updatedCost,

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'organization_id',
      organizationId
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
    data: orderItems,
  } = await supabase
    .from('order_items')
    .select('*')
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'order_id',
      orderItem.order_id
    )

  const orderTotal =
    (orderItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    )

  const orderCost =
    (orderItems || []).reduce(
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

    })
    .eq(
      'organization_id',
      organizationId
    )
    .eq(
      'id',
      orderItem.order_id
    )

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      organization_id:
        organizationId,

      module:
        'pos',

      action:
        'UPDATE_ITEM_QUANTITY',

      reference_id:
        orderItem.order_id,

      metadata: {

        order_item_id:
          orderItemId,

        old_quantity:
          oldQuantity,

        new_quantity:
          quantity,

        updated_by:
          updatedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    orderItemId,

    oldQuantity,

    newQuantity:
      Number(quantity),

    updatedTotal,

    orderTotal,

    orderCost,

  }
}
