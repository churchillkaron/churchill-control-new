import { supabase } from '@/lib/shared/supabase/client'

export async function splitKitchenTicket({
  tenantId,
  sourceKitchenTicketId,
  queueItemIds = [],
  splitBy = 'MANAGER',
  reason = 'Split kitchen ticket',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!sourceKitchenTicketId) {
    throw new Error('sourceKitchenTicketId required')
  }

  if (!queueItemIds.length) {
    throw new Error('queueItemIds required')
  }

  const {
    data: sourceTicket,
    error: sourceError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      sourceKitchenTicketId
    )
    .single()

  if (
    sourceError ||
    !sourceTicket
  ) {

    throw new Error(
      'Source kitchen ticket not found'
    )
  }

  const {
    data: selectedItems,
    error: itemError,
  } = await supabase
    .from('kitchen_queue')
    .select('*')
    .in(
      'id',
      queueItemIds
    )
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      sourceKitchenTicketId
    )

  if (itemError) {
    throw new Error(
      itemError.message
    )
  }

  if (
    !selectedItems ||
    selectedItems.length === 0
  ) {

    throw new Error(
      'No matching kitchen queue items found'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Create New Split Ticket
  |--------------------------------------------------------------------------
  */

  const {
    data: splitTicket,
    error: splitError,
  } = await supabase
    .from('kitchen_tickets')
    .insert({

      tenant_id:
        tenantId,

      order_id:
        sourceTicket.order_id,

      table_number:
        sourceTicket.table_number,

      status:
        'WAITING',

      split_from_ticket_id:
        sourceKitchenTicketId,

      split_by:
        splitBy,

      split_reason:
        reason,

      created_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .select()
    .single()

  if (splitError) {
    throw new Error(
      splitError.message
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Move Queue Items
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      kitchen_ticket_id:
        splitTicket.id,

      updated_at:
        new Date().toISOString(),

    })
    .in(
      'id',
      queueItemIds
    )
    .eq(
      'tenant_id',
      tenantId
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
        'SPLIT_KITCHEN_TICKET',

      reference_id:
        splitTicket.id,

      metadata: {

        source_ticket_id:
          sourceKitchenTicketId,

        split_ticket_id:
          splitTicket.id,

        moved_items:
          queueItemIds,

        split_by:
          splitBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    sourceKitchenTicketId,

    splitKitchenTicketId:
      splitTicket.id,

    movedItems:
      queueItemIds.length,

  }
}
