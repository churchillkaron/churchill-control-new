import { supabase } from '@/lib/shared/supabase/client'

export async function returnKitchenItem({
  tenantId,
  kitchenQueueId,
  returnedBy = 'SERVICE',
  reason = 'Returned item',
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
    kitchenItem.status !==
    'SERVED'
  ) {

    throw new Error(
      'Only served items can be returned'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Return Item To Kitchen
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'RETURNED',

      returned_by:
        returnedBy,

      return_reason:
        reason,

      returned_at:
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
  | Reopen Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'RETURNED',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenItem.kitchen_ticket_id
    )

  /*
  |--------------------------------------------------------------------------
  | Reopen Order Kitchen Status
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      kitchen_status:
        'RETURNED',

      updated_at:
        new Date().toISOString(),

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
        'RETURN_KITCHEN_ITEM',

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

        returned_by:
          returnedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'RETURNED',

  }
}
