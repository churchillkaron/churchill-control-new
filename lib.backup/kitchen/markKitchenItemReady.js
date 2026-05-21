import { supabase } from '@/lib/shared/supabase/client'

export async function markKitchenItemReady({
  tenantId,
  kitchenQueueId,
  readyBy = 'KITCHEN',
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
      'READY',
    ].includes(
      kitchenItem.status
    )
  ) {

    throw new Error(
      'Kitchen item already finalized'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Mark Item Ready
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'READY',

      ready_by:
        readyBy,

      ready_at:
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
  | Verify Remaining Queue
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
      '(READY,BUMPED,COMPLETED)'
    )

  /*
  |--------------------------------------------------------------------------
  | Update Kitchen Ticket
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
          'READY',

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
          'READY',

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
        'MARK_KITCHEN_ITEM_READY',

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

        ready_by:
          readyBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'READY',

  }
}
