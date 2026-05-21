import { supabase } from '@/lib/shared/supabase/client'

export async function serveKitchenItem({
  tenantId,
  kitchenQueueId,
  servedBy = 'SERVICE',
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
    'READY'
  ) {

    throw new Error(
      'Only READY items can be served'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Serve Kitchen Item
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'SERVED',

      served_by:
        servedBy,

      served_at:
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
  | Verify Remaining Items
  |--------------------------------------------------------------------------
  */

  const {
    data: remainingItems,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      kitchenItem.kitchen_ticket_id
    )
    .not(
      'status',
      'in',
      '(SERVED,BUMPED,COMPLETED)'
    )

  /*
  |--------------------------------------------------------------------------
  | Finalize Ticket + Order
  |--------------------------------------------------------------------------
  */

  if (
    !remainingItems ||
    remainingItems.length === 0
  ) {

    await supabase
      .from('kitchen_tickets')
      .update({

        status:
          'SERVED',

        served_at:
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
        kitchenItem.kitchen_ticket_id
      )

    await supabase
      .from('orders')
      .update({

        kitchen_status:
          'SERVED',

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
        'kitchen',

      action:
        'SERVE_KITCHEN_ITEM',

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

        served_by:
          servedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'SERVED',

  }
}
