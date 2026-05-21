import { supabase } from '@/lib/shared/supabase/client'

export async function removeOrderModifier({
  tenantId,
  modifierId,
  removedBy = 'SYSTEM',
  reason = 'Remove modifier',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!modifierId) {
    throw new Error('modifierId required')
  }

  const {
    data: modifier,
    error: modifierError,
  } = await supabase
    .from('order_item_modifiers')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      modifierId
    )
    .single()

  if (
    modifierError ||
    !modifier
  ) {

    throw new Error(
      'Modifier not found'
    )
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
      modifier.order_item_id
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
  | Delete Modifier
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
      'id',
      modifierId
    )

  /*
  |--------------------------------------------------------------------------
  | Update Item Total
  |--------------------------------------------------------------------------
  */

  const updatedItemTotal =
    Number(
      (
        Number(orderItem.total || 0) -
        Number(modifier.total || 0)
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
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      orderItem.id
    )

  /*
  |--------------------------------------------------------------------------
  | Recalculate Order Total
  |--------------------------------------------------------------------------
  */

  const {
    data: orderItems,
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
        updatedOrderTotal,

      total_amount:
        updatedOrderTotal,

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
        'REMOVE_MODIFIER',

      reference_id:
        orderItem.order_id,

      metadata: {

        modifier_id:
          modifierId,

        modifier_name:
          modifier.modifier_name,

        modifier_total:
          modifier.total,

        removed_by:
          removedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    modifierId,

    updatedItemTotal,

    updatedOrderTotal,

  }
}
