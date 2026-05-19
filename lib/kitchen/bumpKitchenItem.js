import { supabase } from '@/lib/shared/supabase/client'

export async function bumpKitchenItem({
  tenantId,
  kitchenQueueId,
  bumpedBy = 'KITCHEN',
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
    'COMPLETED'
  ) {

    throw new Error(
      'Only completed items can be bumped'
    )
  }

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'BUMPED',

      bumped_at:
        new Date().toISOString(),

      bumped_by:
        bumpedBy,

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
  | Verify Remaining Completed Items
  |--------------------------------------------------------------------------
  */

  const {
    data: remainingCompleted,
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
    .neq(
      'status',
      'BUMPED'
    )

  /*
  |--------------------------------------------------------------------------
  | Finalize Ticket
  |--------------------------------------------------------------------------
  */

  if (
    !remainingCompleted ||
    remainingCompleted.length === 0
  ) {

    await supabase
      .from('kitchen_tickets')
      .update({

        status:
          'BUMPED',

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
        'BUMP_KITCHEN_ITEM',

      reference_id:
        kitchenQueueId,

      metadata: {

        order_id:
          kitchenItem.order_id,

        table_number:
          kitchenItem.table_number,

        dish_name:
          kitchenItem.dish_name,

        bumped_by:
          bumpedBy,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenQueueId,

    status:
      'BUMPED',

  }
}
