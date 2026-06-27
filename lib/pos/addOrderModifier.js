import { supabase } from '@/lib/shared/supabase/client'

export async function addOrderModifier({
  organizationId,
  orderItemId,
  modifierName,
  modifierPrice = 0,
  quantity = 1,
  addedBy = 'SYSTEM',
}) {

  if (!organizationId) {
    throw new Error('organizationId required')
  }

  if (!orderItemId) {
    throw new Error('orderItemId required')
  }

  if (!modifierName) {
    throw new Error('modifierName required')
  }

  const {
    data: orderItem,
    error: orderItemError,
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
    orderItemError ||
    !orderItem
  ) {

    throw new Error(
      'Order item not found'
    )
  }

  const modifierTotal =
    Number(
      (
        Number(modifierPrice) *
        Number(quantity)
      ).toFixed(2)
    )

  /*
  |--------------------------------------------------------------------------
  | Create Modifier
  |--------------------------------------------------------------------------
  */

  const {
    data: modifier,
    error: modifierError,
  } = await supabase
    .from('order_item_modifiers')
    .insert({

      organization_id:
        organizationId,

      order_item_id:
        orderItemId,

      modifier_name:
        modifierName,

      modifier_price:
        modifierPrice,

      quantity,

      total:
        modifierTotal,

      added_by:
        addedBy,

      created_at:
        new Date().toISOString(),

    })
    .select()
    .single()

  if (modifierError) {
    throw new Error(
      modifierError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Update Item Total
  |--------------------------------------------------------------------------
  */

  const updatedItemTotal =
    Number(
      (
        Number(orderItem.total || 0) +
        modifierTotal
      ).toFixed(2)
    )

  await supabase
    .from('order_items')
    .update({

      total:
        updatedItemTotal,

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

  const newOrderTotal =
    (orderItems || []).reduce(
      (sum, item) =>
        sum +
        Number(item.total || 0),
      0
    )

  await supabase
    .from('orders')
    .update({

      total:
        newOrderTotal,

      total_amount:
        newOrderTotal,

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
        'ADD_MODIFIER',

      reference_id:
        orderItem.order_id,

      metadata: {

        order_item_id:
          orderItemId,

        modifier_name:
          modifierName,

        modifier_price:
          modifierPrice,

        quantity,

        total:
          modifierTotal,

        added_by:
          addedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    modifier,

    updatedItemTotal,

    updatedOrderTotal:
      newOrderTotal,

  }
}
