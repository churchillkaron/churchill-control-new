import { supabase } from '@/lib/shared/supabase/client'

export async function refireKitchenItem({
  tenantId,
  kitchenQueueId,
  refiredBy = 'KITCHEN',
  reason = 'Refire item',
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
    ![
      'RETURNED',
      'REJECTED',
    ].includes(
      kitchenItem.status
    )
  ) {

    throw new Error(
      'Only RETURNED or REJECTED items can be refired'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Refire Kitchen Item
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'WAITING',

      priority:
        'URGENT',

      refired_by:
        refiredBy,

      refire_reason:
        reason,

      refired_at:
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
        'WAITING',

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
  | Reopen Order
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      kitchen_status:
        'WAITING',

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
        'REFIRE_KITCHEN_ITEM',

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

        refired_by:
          refiredBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'WAITING',

    priority:
      'URGENT',

  }
}
