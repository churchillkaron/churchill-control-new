import { supabase } from '@/lib/shared/supabase/client'

export async function recallCancelledKitchenItem({
  tenantId,
  kitchenQueueId,
  recalledBy = 'MANAGER',
  reason = 'Recall cancelled item',
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
    'CANCELLED'
  ) {

    throw new Error(
      'Only cancelled items can be recalled'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Kitchen Queue
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'WAITING',

      recalled_by:
        recalledBy,

      recall_reason:
        reason,

      recalled_at:
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
  | Restore Order
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      status:
        'OPEN',

      kitchen_status:
        'WAITING',

      production_status:
        'PENDING',

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
  | Restore Kitchen Ticket
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
        'RECALL_CANCELLED_KITCHEN_ITEM',

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

        recalled_by:
          recalledBy,

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

  }
}
